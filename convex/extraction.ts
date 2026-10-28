import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { eventAccess, signedInUser } from "./access";
import { extractFromExcerpt, type ExtractionOutput } from "../lib/extraction";
import { anthropicAdapter, DEFAULT_EXTRACTION_MODEL } from "../lib/anthropic-extraction";
import { fallbackAdapter } from "../lib/fallback-parser";
import { chunkByLines } from "../lib/chunk-text";

export const snapshotContext = internalQuery({
  args: { snapshotId: v.id("sourceSnapshots") },
  handler: async (ctx, { snapshotId }) => {
    const snapshot = await ctx.db.get(snapshotId);
    const source = snapshot && await ctx.db.get(snapshot.sourceId);
    if (!snapshot || !source) return null;
    return {
      content: snapshot.content,
      revision: snapshot.revision,
      sourceId: source._id,
      eventId: source.eventId,
      archived: source.archived === true,
    };
  },
});

export const startRun = internalMutation({
  args: {
    eventId: v.id("events"),
    snapshotId: v.id("sourceSnapshots"),
    engine: v.union(v.literal("anthropic"), v.literal("fallback")),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // At most one non-failed run per snapshot keeps reprocessing idempotent.
    const runs = await ctx.db.query("extractionRuns").withIndex("by_snapshot", q => q.eq("snapshotId", args.snapshotId)).collect();
    if (runs.some(run => run.status !== "failed")) return null;
    return ctx.db.insert("extractionRuns", { ...args, status: "running", startedAt: Date.now() });
  },
});

export const finishRun = internalMutation({
  args: {
    runId: v.id("extractionRuns"),
    status: v.union(v.literal("succeeded"), v.literal("failed")),
    error: v.optional(v.string()),
    itemCount: v.optional(v.number()),
    proposalCount: v.optional(v.number()),
  },
  handler: async (ctx, { runId, ...rest }) => {
    const run = await ctx.db.get(runId);
    if (!run) return;
    await ctx.db.patch(runId, { ...rest, finishedAt: Date.now() });
  },
});

/** Which extraction engine this deployment will use (no secrets exposed). */
export const engine = query({
  args: {},
  handler: async (ctx) => {
    await signedInUser(ctx);
    const aiConfigured = Boolean(process.env.ANTHROPIC_API_KEY);
    return {
      aiConfigured,
      model: aiConfigured ? (process.env.EXTRACTION_MODEL?.trim() || DEFAULT_EXTRACTION_MODEL) : "deterministic-line-parser",
    };
  },
});

export const recentForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    await eventAccess(ctx, eventId, "read");
    return ctx.db.query("extractionRuns").withIndex("by_event", q => q.eq("eventId", eventId)).order("desc").take(5);
  },
});

/**
 * Turn one snapshot into reviewable master proposals. Uses the configured
 * model when available, otherwise the deterministic line parser, and always
 * passes through the provenance validator — nothing unverifiable is proposed,
 * and nothing is approved here.
 */
export const runSnapshot = internalAction({
  args: { snapshotId: v.id("sourceSnapshots") },
  handler: async (ctx, { snapshotId }) => {
    const context = await ctx.runQuery(internal.extraction.snapshotContext, { snapshotId });
    if (!context || context.archived) return;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const engine = apiKey ? "anthropic" as const : "fallback" as const;
    const model = apiKey ? (process.env.EXTRACTION_MODEL?.trim() || DEFAULT_EXTRACTION_MODEL) : "deterministic-line-parser";
    const runId = await ctx.runMutation(internal.extraction.startRun, { eventId: context.eventId, snapshotId, engine, model });
    if (!runId) return;
    try {
      const adapter = apiKey ? anthropicAdapter({ apiKey, model }) : fallbackAdapter();
      const items: ExtractionOutput["items"] = [];
      for (const chunk of chunkByLines(context.content)) {
        const result = await extractFromExcerpt({ sourceId: context.sourceId, revision: context.revision, text: chunk }, adapter);
        items.push(...result.items);
      }
      const limited = items.slice(0, 200);
      const ingested: { created: number; skipped: number } = await ctx.runMutation(internal.master.ingestExtraction, { eventId: context.eventId, snapshotId, items: limited });
      await ctx.runMutation(internal.extraction.finishRun, { runId, status: "succeeded", itemCount: limited.length, proposalCount: ingested.created });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "Extraction failed";
      await ctx.runMutation(internal.extraction.finishRun, { runId, status: "failed", error: message });
    }
  },
});
