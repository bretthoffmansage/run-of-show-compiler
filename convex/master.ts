import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
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
  },
  handler: async (ctx, { eventId, snapshotId, items }) => {
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
          snapshot.content.includes(field.evidence.snippet) &&
          (field.origin !== "source_exact" || field.evidence.snippet.includes(field.value)) &&
          field.confidence >= 0 && field.confidence <= 1;
        if (!valid) { skipped++; continue; }
        // A value matching the master is quiet — unless that field is flagged
        // as a conflict, in which case the agreement must recompile so the
        // red mark can clear.
        const priorField = priorFields.get(`${entryKey}\u0000${field.key}`);
        if (priorField?.value === field.value && !priorField.conflict) { skipped++; continue; }
        const dedupeKey = `${entryKey}\u0000${field.key}\u0000${field.value}`;
        if (pendingSet.has(dedupeKey)) { skipped++; continue; }
        pendingSet.add(dedupeKey);
        const proposalId = await ctx.db.insert("masterProposals", {
          eventId, snapshotId, entryKey, fieldKey: field.key, proposedValue: field.value,
          snippet: field.evidence.snippet, origin: field.origin, confidence: field.confidence,
          state: "pending", createdAt: now,
        });
        createdIds.push(proposalId);
        created++;
      }
    }
    if (!created) return { created, skipped, applied: 0 };

    // ── Auto-compile the affected fields ────────────────────────────────────
    const createdProposals = (await Promise.all(createdIds.map(id => ctx.db.get(id)))).filter((p): p is Doc<"masterProposals"> => p !== null);
    const affectedKeys = new Set(createdProposals.map(p => `${p.entryKey}\u0000${p.fieldKey}`));
    // Candidate pool: every non-rejected proposal for an affected field, across all sources.
    const candidates = [...existing, ...createdProposals].filter(p => p.state !== "rejected" && affectedKeys.has(`${p.entryKey}\u0000${p.fieldKey}`));
    const snapshotIds = [...new Set(candidates.map(p => p.snapshotId))];
    const snapshotDocs = await Promise.all(snapshotIds.map(id => ctx.db.get(id)));
    const snapshotInfo = new Map(snapshotIds.map((id, i) => [id, snapshotDocs[i]]));
    const newFields: Doc<"masterRevisions">["fields"] = [];
    for (const key of affectedKeys) {
      const [entryKey, fieldKey] = key.split("\u0000");
      const forKey = candidates.filter(p => p.entryKey === entryKey && p.fieldKey === fieldKey);
      // Latest candidate per source decides that source's current claim.
      // Candidates are ordered oldest-first ([...existing, ...created]), so a
      // timestamp tie resolves toward the newer insertion.
      const latestBySource = new Map<string, Doc<"masterProposals">>();
      for (const candidate of forKey) {
        const capturedAt = snapshotInfo.get(candidate.snapshotId)?.capturedAt ?? candidate.createdAt;
        const sourceKey = String(snapshotInfo.get(candidate.snapshotId)?.sourceId ?? candidate.snapshotId);
        const incumbent = latestBySource.get(sourceKey);
        const incumbentAt = incumbent ? (snapshotInfo.get(incumbent.snapshotId)?.capturedAt ?? incumbent.createdAt) : -1;
        if (!incumbent || capturedAt > incumbentAt || (capturedAt === incumbentAt && candidate.createdAt >= incumbent.createdAt)) latestBySource.set(sourceKey, candidate);
      }
      const claims = [...latestBySource.values()];
      const conflict = new Set(claims.map(c => c.proposedValue)).size > 1;
      // Most recently captured source wins the cell; conflict renders red.
      const winner = claims.reduce((best, c) => {
        const bestAt = snapshotInfo.get(best.snapshotId)?.capturedAt ?? best.createdAt;
        const at = snapshotInfo.get(c.snapshotId)?.capturedAt ?? c.createdAt;
        return at > bestAt || (at === bestAt && c.createdAt >= best.createdAt) ? c : best;
      });
      const prior = priorFields.get(key);
      if (prior && prior.value === winner.proposedValue && Boolean(prior.conflict) === conflict) continue;
      newFields.push({
        entryKey, fieldKey, value: winner.proposedValue, origin: "source", snapshotId: winner.snapshotId,
        conflict: conflict || undefined,
        changedAt: prior && prior.value !== winner.proposedValue ? now : prior?.changedAt,
      });
    }
    let masterRevisionId: Id<"masterRevisions"> | null = null;
    if (newFields.length) masterRevisionId = await nextRevision(ctx, eventId, "auto-compiler", newFields);
    for (const proposal of createdProposals) {
      await ctx.db.patch(proposal._id, { state: "approved", decidedBy: "auto-compiler", decidedAt: now });
      await ctx.db.insert("masterDecisions", { eventId, proposalId: proposal._id, kind: "approve", actor: "auto-compiler", at: now, ...(masterRevisionId ? { masterRevisionId } : {}) });
    }
    return { created, skipped, applied: newFields.length };
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
    return masterRevisionId;
  },
});
