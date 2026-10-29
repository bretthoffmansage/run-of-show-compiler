import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { eventAccess, signedInUser } from "./access";
import { extractFromExcerpt, type ExtractionOutput, type ModelAdapter } from "../lib/extraction";
import { anthropicAdapter, DEFAULT_EXTRACTION_MODEL } from "../lib/anthropic-extraction";
import { DEFAULT_GATEWAY_MODEL, gatewayAdapter } from "../lib/gateway-extraction";
import { fallbackAdapter } from "../lib/fallback-parser";
import { chunkByLines } from "../lib/chunk-text";

type Engine = "gateway" | "anthropic" | "fallback";

/**
 * Transport preference: the Vercel AI Gateway when its key is configured
 * (read under AI_GATEWAY_API_KEY), else the direct Anthropic API, else the
 * deterministic fallback parser.
 */
function selectEngine(): { engine: Engine; model: string; adapter: ModelAdapter } {
  const gatewayKey = process.env.AI_GATEWAY_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const configuredModel = process.env.EXTRACTION_MODEL?.trim();
  if (gatewayKey) {
    const model = configuredModel || DEFAULT_GATEWAY_MODEL;
    return { engine: "gateway", model, adapter: gatewayAdapter({ apiKey: gatewayKey, model }) };
  }
  if (anthropicKey) {
    const model = configuredModel || DEFAULT_EXTRACTION_MODEL;
    return { engine: "anthropic", model, adapter: anthropicAdapter({ apiKey: anthropicKey, model }) };
  }
  return { engine: "fallback", model: "deterministic-line-parser", adapter: fallbackAdapter() };
}

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
    engine: v.union(v.literal("gateway"), v.literal("anthropic"), v.literal("fallback")),
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
    const { engine, model } = selectEngine();
    return { aiConfigured: engine !== "fallback", engine, model };
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
    const { engine, model, adapter } = selectEngine();
    const runId = await ctx.runMutation(internal.extraction.startRun, { eventId: context.eventId, snapshotId, engine, model });
    if (!runId) return;
    try {
      // Convex kills actions at 10 minutes, and a killed action can record
      // nothing — so the chunk loop carries its own time budget and chunk
      // failures are kept per-chunk: whatever extracted still compiles.
      const deadline = Date.now() + 7 * 60 * 1000;
      const chunks = chunkByLines(context.content).slice(0, 24);
      const items: ExtractionOutput["items"] = [];
      let failedChunks = 0;
      let skippedChunks = 0;
      let firstError: string | null = null;
      for (const chunk of chunks) {
        if (Date.now() > deadline) { skippedChunks++; continue; }
        try {
          const result = await extractFromExcerpt({ sourceId: context.sourceId, revision: context.revision, text: chunk }, adapter);
          items.push(...result.items);
        } catch (error) {
          failedChunks++;
          firstError ??= error instanceof Error ? error.message.slice(0, 300) : "chunk failed";
        }
      }
      const limited = items.slice(0, 200);
      if (!limited.length && (failedChunks || skippedChunks)) {
        await ctx.runMutation(internal.extraction.finishRun, { runId, status: "failed", error: firstError ?? `ran out of time (${skippedChunks} chunks unprocessed)` });
        return;
      }
      const ingested: { created: number; skipped: number } = await ctx.runMutation(internal.master.ingestExtraction, { eventId: context.eventId, snapshotId, items: limited });
      const partial = failedChunks + skippedChunks;
      await ctx.runMutation(internal.extraction.finishRun, {
        runId, status: "succeeded", itemCount: limited.length, proposalCount: ingested.created,
        ...(partial ? { error: `partial: ${partial}/${chunks.length} chunks not processed${firstError ? ` (${firstError})` : ""}` } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "Extraction failed";
      await ctx.runMutation(internal.extraction.finishRun, { runId, status: "failed", error: message });
    }
  },
});

/** A run "running" for longer than Convex allows an action to live is a zombie. */
const STUCK_RUN_MS = 12 * 60 * 1000;

export const reapStuckRuns = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - STUCK_RUN_MS;
    const stuck = (await ctx.db.query("extractionRuns").collect()).filter(run => run.status === "running" && run.startedAt < cutoff);
    for (const run of stuck) {
      await ctx.db.patch(run._id, { status: "failed", error: "timed_out", finishedAt: Date.now() });
    }
    return [...new Set(stuck.map(run => run.snapshotId))];
  },
});

/**
 * Cron: mark zombie runs failed (which also unblocks startRun's dedupe
 * guard) and re-run their snapshots. With the bounded loop above, the retry
 * finishes and compiles instead of dying the same way.
 */
export const retryStuck = internalAction({
  args: {},
  handler: async (ctx) => {
    const snapshotIds = await ctx.runMutation(internal.extraction.reapStuckRuns, {});
    for (const snapshotId of snapshotIds) {
      await ctx.scheduler.runAfter(0, internal.extraction.runSnapshot, { snapshotId });
    }
  },
});
