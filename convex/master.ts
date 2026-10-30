import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { eventAccess } from "./access";
import { entryKeyFor, uniqueEntryKeys } from "../lib/entry-key";
import type { Doc, Id } from "./_generated/dataModel";

const fieldName = v.union(
  v.literal("day"), v.literal("date"), v.literal("start_time"), v.literal("end_time"),
  v.literal("duration"), v.literal("time_zone"), v.literal("title"), v.literal("type"),
  v.literal("speaker"), v.literal("audience"), v.literal("script"), v.literal("stage_direction"),
  v.literal("video"), v.literal("slides"), v.literal("audio"), v.literal("production_note"),
  v.literal("break"), v.literal("source_order"), v.literal("dependency"), v.literal("additional_detail"),
);

const extractedField = v.object({
  key: fieldName,
  value: v.string(),
  origin: v.union(v.literal("source_exact"), v.literal("inferred")),
  confidence: v.number(),
  evidence: v.object({
    sourceId: v.string(),
    revision: v.string(),
    snippet: v.string(),
    originalLabel: v.optional(v.string()),
  }),
});

function validText(value: string, max = 4000): boolean {
  return Boolean(value.trim() && value.length <= max);
}

/**
 * Store validated extraction output and compile it into the master
 * immediately — zero approval clicks. Every applied field keeps its proposal
 * as the audit record (state "approved", decided by the auto-compiler).
 * When sources disagree about a field, the most recently captured source
 * wins the cell and the field is flagged `conflict` (rendered red); values
 * that changed from the prior compile carry `changedAt` (rendered pink while
 * fresh). Inconsistencies never block compilation — they are visual cues for
 * the humans running the event.
 */
export const ingestExtraction = internalMutation({
  args: {
    eventId: v.id("events"),
    snapshotId: v.id("sourceSnapshots"),
    items: v.array(v.object({ fields: v.array(extractedField) })),
    partial: v.optional(v.boolean()),
  },
  handler: async (ctx, { eventId, snapshotId, items, partial }) => {
    const snapshot = await ctx.db.get(snapshotId);
    const source = snapshot && await ctx.db.get(snapshot.sourceId);
    const event = await ctx.db.get(eventId);
    if (!snapshot || !source || !event || event.archived || source.archived || source.eventId !== eventId) throw new Error("Invalid extraction target");
    const latestRevision = await ctx.db.query("masterRevisions").withIndex("by_event", q => q.eq("eventId", eventId)).order("desc").first();
    const priorFields = new Map((latestRevision?.fields ?? []).map(field => [`${field.entryKey}\u0000${field.fieldKey}`, field]));
    const existing = await ctx.db.query("masterProposals").withIndex("by_event", q => q.eq("eventId", eventId)).collect();
    const pendingSet = new Set(existing.filter(p => p.state === "pending").map(p => `${p.entryKey}\u0000${p.fieldKey}\u0000${p.proposedValue}`));
    const entryKeys = uniqueEntryKeys(items.map(item => entryKeyFor(item.fields)));
    const now = Date.now();
    // Whitespace-tolerant provenance (tabs vs spaces in spreadsheet dumps).
    const squash = (text: string) => text.replace(/\s+/g, " ");
    const normalizedContent = squash(snapshot.content);
    const createdIds: Id<"masterProposals">[] = [];
    let created = 0;
    let skipped = 0;
    for (let index = 0; index < items.length; index++) {
      const entryKey = entryKeys[index];
      for (const field of items[index].fields) {
        const valid =
          field.evidence.sourceId === String(source._id) &&
          field.evidence.revision === snapshot.revision &&
          validText(entryKey, 200) && validText(field.value) && validText(field.evidence.snippet) &&
          (snapshot.content.includes(field.evidence.snippet) || normalizedContent.includes(squash(field.evidence.snippet))) &&
          (field.origin !== "source_exact" || field.evidence.snippet.includes(field.value) || squash(field.evidence.snippet).includes(squash(field.value))) &&
          field.confidence >= 0 && field.confidence <= 1;
        if (!valid) { skipped++; continue; }
        // Every valid field of this snapshot gets its proposal: the compile
        // below rebuilds from each source's LATEST snapshot only, so a claim
        // not re-recorded here would silently drop out of the master.
        const dedupeKey = `${entryKey}\u0000${field.key}\u0000${field.value}`;
        if (pendingSet.has(dedupeKey)) { skipped++; continue; }
        pendingSet.add(dedupeKey);
        const proposalId = await ctx.db.insert("masterProposals", {
          eventId, snapshotId, entryKey, fieldKey: field.key, proposedValue: field.value,
          snippet: field.evidence.snippet, origin: field.origin, confidence: field.confidence,
          state: "pending", createdAt: now, ...(partial ? { partial: true } : {}),
        });
        createdIds.push(proposalId);
        created++;
      }
    }
    if (!created) return { created, skipped, applied: 0 };

    // ── Recompile: the master mirrors the CURRENT documents ────────────────
    // Claims come only from each source's latest extracted snapshot, so rows
    // that disappear from a document disappear from the compile instead of
    // lingering from stale snapshots. Operator manual edits are kept for
    // fields no current source claims.
    const createdProposals = (await Promise.all(createdIds.map(id => ctx.db.get(id)))).filter((p): p is Doc<"masterProposals"> => p !== null);
    const allProposals = [...existing.filter(p => p.state !== "rejected"), ...createdProposals];
    const snapshotIds = [...new Set(allProposals.map(p => p.snapshotId))];
    const snapshotDocs = await Promise.all(snapshotIds.map(id => ctx.db.get(id)));
    const snapshotInfo = new Map(snapshotIds.map((id, i) => [id, snapshotDocs[i]]));
    // Per source, the newest extraction batch wins (one ingest stamps all its
    // proposals with one createdAt) — but a PARTIAL batch never replaces a
    // complete one: batches stack newest-first down to the most recent
    // complete read, and an older batch only fills (entry, field) slots the
    // newer ones didn't cover. A partial re-read can add or update rows; it
    // can never erase days the complete read found.
    const sourceOf = (p: Doc<"masterProposals">) => String(snapshotInfo.get(p.snapshotId)?.sourceId ?? p.snapshotId);
    const batchesBySource = new Map<string, Map<number, Doc<"masterProposals">[]>>();
    for (const proposal of allProposals) {
      const source = sourceOf(proposal);
      const batches = batchesBySource.get(source) ?? new Map<number, Doc<"masterProposals">[]>();
      batches.set(proposal.createdAt, [...(batches.get(proposal.createdAt) ?? []), proposal]);
      batchesBySource.set(source, batches);
    }
    const candidates: Doc<"masterProposals">[] = [];
    for (const batches of batchesBySource.values()) {
      const covered = new Set<string>();
      for (const createdAt of [...batches.keys()].sort((a, b) => b - a)) {
        const batch = batches.get(createdAt)!;
        const fresh = batch.filter(p => !covered.has(`${p.entryKey}\u0000${p.fieldKey}`));
        candidates.push(...fresh);
        for (const p of batch) covered.add(`${p.entryKey}\u0000${p.fieldKey}`);
        if (!batch.some(p => p.partial)) break;
      }
    }
    const keys = [...new Set(candidates.map(p => `${p.entryKey}\u0000${p.fieldKey}`))];
    const newFields: Doc<"masterRevisions">["fields"] = [];
    for (const key of keys) {
      const [entryKey, fieldKey] = key.split("\u0000");
      const forKey = candidates.filter(p => p.entryKey === entryKey && p.fieldKey === fieldKey);
      // One live snapshot per source; within it, the newest proposal is that
      // source's claim.
      const claimBySource = new Map<string, Doc<"masterProposals">>();
      for (const candidate of forKey) {
        const sourceKey = String(snapshotInfo.get(candidate.snapshotId)?.sourceId ?? candidate.snapshotId);
        const incumbent = claimBySource.get(sourceKey);
        if (!incumbent || candidate.createdAt >= incumbent.createdAt) claimBySource.set(sourceKey, candidate);
      }
      const claims = [...claimBySource.values()];
      const conflict = new Set(claims.map(c => c.proposedValue)).size > 1;
      // Most recently captured source wins the cell; conflict renders red.
      const winner = claims.reduce((best, c) => {
        const bestAt = snapshotInfo.get(best.snapshotId)?.capturedAt ?? best.createdAt;
        const at = snapshotInfo.get(c.snapshotId)?.capturedAt ?? c.createdAt;
        return at > bestAt || (at === bestAt && c.createdAt >= best.createdAt) ? c : best;
      });
      const prior = priorFields.get(key);
      newFields.push({
        entryKey, fieldKey, value: winner.proposedValue, origin: "source", snapshotId: winner.snapshotId,
        conflict: conflict || undefined,
        changedAt: prior && prior.value !== winner.proposedValue ? now : prior?.changedAt,
      });
    }
    // Operator corrections survive until a current source claims the field.
    const keySet = new Set(keys);
    for (const [key, prior] of priorFields) {
      if (prior.origin === "operator" && !keySet.has(key)) newFields.push(prior);
    }
    // A new immutable revision only when the compile actually changed.
    const fingerprint = (fields: Doc<"masterRevisions">["fields"]) => JSON.stringify(
      [...fields]
        .sort((a, b) => `${a.entryKey}\u0000${a.fieldKey}`.localeCompare(`${b.entryKey}\u0000${b.fieldKey}`))
        .map(f => [f.entryKey, f.fieldKey, f.value, Boolean(f.conflict), f.changedAt ?? 0, f.origin]),
    );
    const changed = fingerprint(newFields) !== fingerprint(latestRevision?.fields ?? []);
    let masterRevisionId: Id<"masterRevisions"> | null = null;
    if (changed) {
      masterRevisionId = await replaceRevision(ctx, eventId, "auto-compiler", newFields);
      // The compiled result flows straight into the Google Sheet playbook.
      await ctx.scheduler.runAfter(0, internal.playbooks.syncPlaybook, { eventId });
    }
    for (const proposal of createdProposals) {
      await ctx.db.patch(proposal._id, { state: "approved", decidedBy: "auto-compiler", decidedAt: now });
      await ctx.db.insert("masterDecisions", { eventId, proposalId: proposal._id, kind: "approve", actor: "auto-compiler", at: now, ...(masterRevisionId ? { masterRevisionId } : {}) });
    }
    return { created, skipped, applied: changed ? newFields.length : 0 };
  },
});

export const listProposals = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    await eventAccess(ctx, eventId, "read");
    return ctx.db.query("masterProposals").withIndex("by_event", q => q.eq("eventId", eventId)).collect();
  },
});

export const latest = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    await eventAccess(ctx, eventId, "read");
    return ctx.db.query("masterRevisions").withIndex("by_event", q => q.eq("eventId", eventId)).order("desc").first();
  },
});

export const history = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    await eventAccess(ctx, eventId, "read");
    const revisions = await ctx.db.query("masterRevisions").withIndex("by_event", q => q.eq("eventId", eventId)).order("desc").collect();
    const decisions = await ctx.db.query("masterDecisions").withIndex("by_event", q => q.eq("eventId", eventId)).order("desc").collect();
    return { revisions, decisions };
  },
});

/** Full-replace revision: the compile IS the current documents' state. */
async function replaceRevision(ctx: MutationCtx, eventId: Id<"events">, actor: string, fields: Doc<"masterRevisions">["fields"]) {
  const previous = await ctx.db.query("masterRevisions").withIndex("by_event", q => q.eq("eventId", eventId)).order("desc").first();
  return ctx.db.insert("masterRevisions", { eventId, number: (previous?.number ?? 0) + 1, fields, createdAt: Date.now(), approvedBy: actor });
}

async function nextRevision(ctx: MutationCtx, eventId: Id<"events">, actor: string, newFields: Doc<"masterRevisions">["fields"]) {
  const previous = await ctx.db.query("masterRevisions").withIndex("by_event", q => q.eq("eventId", eventId)).order("desc").first();
  const fields = [...(previous?.fields ?? [])];
  for (const newField of newFields) {
    const index = fields.findIndex(field => field.entryKey === newField.entryKey && field.fieldKey === newField.fieldKey);
    if (index >= 0) fields[index] = newField; else fields.push(newField);
  }
  return ctx.db.insert("masterRevisions", { eventId, number: (previous?.number ?? 0) + 1, fields, createdAt: Date.now(), approvedBy: actor });
}

export const manualEdit = mutation({
  args: { eventId: v.id("events"), entryKey: v.string(), fieldKey: fieldName, value: v.string() },
  handler: async (ctx, { eventId, entryKey, fieldKey, value }) => {
    const { userId } = await eventAccess(ctx, eventId, "edit");
    if (!validText(entryKey, 200) || !validText(value)) throw new Error("Invalid manual value");
    const masterRevisionId = await nextRevision(ctx, eventId, userId, [{ entryKey, fieldKey, value, origin: "operator" }]);
    await ctx.db.insert("masterDecisions", { eventId, kind: "manual_edit", actor: userId, at: Date.now(), masterRevisionId });
    await ctx.scheduler.runAfter(0, internal.playbooks.syncPlaybook, { eventId });
    return masterRevisionId;
  },
});
