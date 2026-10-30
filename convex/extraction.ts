import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { eventAccess, signedInUser } from "./access";
import { extractFromExcerpt, type ExtractionOutput, type ModelAdapter } from "../lib/extraction";
import { anthropicAdapter, DEFAULT_EXTRACTION_MODEL } from "../lib/anthropic-extraction";
import { DEFAULT_GATEWAY_MODEL, gatewayAdapter } from "../lib/gateway-extraction";
import { fallbackAdapter } from "../lib/fallback-parser";
import { chunkByLines, chunkBySections, headerNamesDay } from "../lib/chunk-text";

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

/**
 * Bump when the extraction rules change meaningfully (e.g. verbatim times,
 * day-header dates): the reaper cron then re-extracts every source's latest
 * snapshot under the new rules and the compile rebuilds from the result.
 */
export const EXTRACTION_PROMPT_VERSION = 5;

export const startRun = internalMutation({
  args: {
    eventId: v.id("events"),
    snapshotId: v.id("sourceSnapshots"),
    engine: v.union(v.literal("gateway"), v.literal("anthropic"), v.literal("fallback")),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // At most one non-failed CURRENT-RULES run per snapshot keeps
    // reprocessing idempotent; older-rules runs don't block a re-extract.
    const runs = await ctx.db.query("extractionRuns").withIndex("by_snapshot", q => q.eq("snapshotId", args.snapshotId)).collect();
    if (runs.some(run => run.status !== "failed" && (run.promptVersion ?? 1) >= EXTRACTION_PROMPT_VERSION)) return null;
    return ctx.db.insert("extractionRuns", { ...args, status: "running", startedAt: Date.now(), promptVersion: EXTRACTION_PROMPT_VERSION });
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
      // Chunks whose extraction output overflows the model's token cap
      // (dense spreadsheets) are bisected and retried at a smaller size.
      // Complete coverage: 10KB chunks stay far inside the 100-item report
      // schema (a dense cue sheet is ~10 rows/KB), several chunks extract in
      // parallel so the whole document fits the time budget, and chunks that
      // still overflow the model's output bisect and retry.
      const deadline = Date.now() + 8 * 60 * 1000;
      // Tab-aware chunks: each belongs to exactly one tab and starts with
      // that tab's "# <title>" header, so no row is cut off from its day.
      const queue = chunkBySections(context.content, 10_000).slice(0, 60).map(section => ({ chunk: section.text, header: section.header, depth: 0, retries: 0 }));
      const items: ExtractionOutput["items"] = [];
      let attempted = 0;
      let failedChunks = 0;
      let skippedChunks = 0;
      let firstError: string | null = null;
      const MIN_SPLIT_BYTES = 2_500;
      const MAX_TASKS = 100;
      const CONCURRENCY = 3;
      const worker = async () => {
        while (queue.length) {
          const task = queue.shift()!;
          if (Date.now() > deadline || attempted >= MAX_TASKS) { skippedChunks++; continue; }
          attempted++;
          try {
            const result = await extractFromExcerpt({ sourceId: context.sourceId, revision: context.revision, text: task.chunk }, adapter);
            // Deterministic day attachment: when the tab header names a day
            // or date, every row from this chunk carries it verbatim — the
            // model is not trusted to remember. Rows that already report a
            // date keep their own.
            if (headerNamesDay(task.header)) {
              for (const item of result.items) {
                if (item.fields.some(f => f.key === "date")) continue;
                item.fields.push({
                  key: "date", value: task.header!, origin: "source_exact", confidence: 1,
                  evidence: { sourceId: context.sourceId, revision: context.revision, snippet: task.header! },
                });
              }
            }
            items.push(...result.items);
          } catch (error) {
            const message = error instanceof Error ? error.message : "chunk failed";
            const dense = /truncated|non-JSON/i.test(message);
            const bytes = new TextEncoder().encode(task.chunk).length;
            if (dense && bytes > MIN_SPLIT_BYTES && task.depth < 4) {
              // Halve the chunk (keeping its tab header on each half): smaller
              // input → smaller output → fits the cap.
              const headerLine = task.header !== null ? `# ${task.header}` : null;
              const body = headerLine && task.chunk.startsWith(`${headerLine}\n`) ? task.chunk.slice(headerLine.length + 1) : task.chunk;
              const halves = chunkByLines(body, Math.max(MIN_SPLIT_BYTES, Math.ceil(bytes / 2)));
              queue.unshift(...halves.map(half => ({ chunk: headerLine ? `${headerLine}\n${half}` : half, header: task.header, depth: task.depth + 1, retries: 0 })));
              continue;
            }
            // Transient provider trouble (rate limits, 5xx): back of the
            // queue, try again — a 429 must not silently cost rows.
            if (/\((429|5\d\d)\)/.test(message) && task.retries < 2) {
              queue.push({ ...task, retries: task.retries + 1 });
              continue;
            }
            failedChunks++;
            firstError ??= message.slice(0, 300);
          }
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
      const limited = items.slice(0, 600);
      if (!limited.length && (failedChunks || skippedChunks)) {
        await ctx.runMutation(internal.extraction.finishRun, { runId, status: "failed", error: firstError ?? `ran out of time (${skippedChunks} chunks unprocessed)` });
        return;
      }
      const partial = failedChunks + skippedChunks;
      // A partial read never replaces a complete one: the compile layers it
      // over the previous complete read instead (see master.ingestExtraction).
      const ingested: { created: number; skipped: number } = await ctx.runMutation(internal.master.ingestExtraction, { eventId: context.eventId, snapshotId, items: limited, partial: partial > 0 || items.length > limited.length });
      await ctx.runMutation(internal.extraction.finishRun, {
        runId, status: "succeeded", itemCount: limited.length, proposalCount: ingested.created,
        ...(partial ? { error: `partial: ${partial} chunks not processed${firstError ? ` (${firstError})` : ""}` } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "Extraction failed";
      await ctx.runMutation(internal.extraction.finishRun, { runId, status: "failed", error: message });
    }
  },
});

/** A run "running" for longer than Convex allows an action to live is a zombie. */
const STUCK_RUN_MS = 12 * 60 * 1000;

const MAX_AUTO_RETRIES = 5;

export const reapStuckRuns = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - STUCK_RUN_MS;
    const runs = await ctx.db.query("extractionRuns").collect();
    for (const run of runs) {
      if (run.status === "running" && run.startedAt < cutoff) {
        await ctx.db.patch(run._id, { status: "failed", error: "timed_out", finishedAt: Date.now() });
        run.status = "failed";
      }
    }
    // Retry a source's latest snapshot when it has no successful run under
    // the CURRENT extraction rules (bounded): covers both failures and
    // snapshots last extracted under older rules.
    const bySnapshot = new Map<typeof runs[number]["snapshotId"], typeof runs>();
    for (const run of runs) bySnapshot.set(run.snapshotId, [...(bySnapshot.get(run.snapshotId) ?? []), run]);
    const retry: Array<typeof runs[number]["snapshotId"]> = [];
    for (const [snapshotId, group] of bySnapshot) {
      const currentRuns = group.filter(run => (run.promptVersion ?? 1) >= EXTRACTION_PROMPT_VERSION);
      if (currentRuns.some(run => run.status !== "failed")) continue;
      if (currentRuns.length >= MAX_AUTO_RETRIES) continue;
      const snapshot = await ctx.db.get(snapshotId);
      if (!snapshot) continue;
      const latest = await ctx.db.query("sourceSnapshots").withIndex("by_source", q => q.eq("sourceId", snapshot.sourceId)).order("desc").first();
      if (latest?._id === snapshotId) retry.push(snapshotId);
    }
    return retry;
  },
});

/**
 * Cron: mark zombie runs failed (which also unblocks startRun's dedupe
 * guard) and re-run snapshots that have only failures. With the bounded,
 * bisecting loop above, retries converge instead of dying the same way.
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
