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

export const propose = internalMutation({
  args: {
    eventId: v.id("events"), snapshotId: v.id("sourceSnapshots"), entryKey: v.string(),
    fieldKey: fieldName, proposedValue: v.string(), snippet: v.string(),
    origin: v.union(v.literal("source_exact"), v.literal("inferred")), confidence: v.number(),
  },
  handler: async (ctx, args) => {
    const snapshot = await ctx.db.get(args.snapshotId);
    const source = snapshot && await ctx.db.get(snapshot.sourceId);
    const event = await ctx.db.get(args.eventId);
    if (!snapshot || !source || !event || event.archived || source.archived || source.eventId !== args.eventId) throw new Error("Invalid proposal source");
    if (!validText(args.entryKey, 200) || !validText(args.proposedValue) || !validText(args.snippet) || !snapshot.content.includes(args.snippet)) throw new Error("Invalid proposal evidence");
    if (args.origin === "source_exact" && !args.snippet.includes(args.proposedValue)) throw new Error("Invalid proposal evidence");
    if (args.confidence < 0 || args.confidence > 1) throw new Error("Invalid confidence");
    return ctx.db.insert("masterProposals", { ...args, state: "pending", createdAt: Date.now() });
  },
});

/**
 * Store validated extraction output as pending proposals. Entry identity is
 * derived from content so re-extractions of unchanged material are quiet:
 * fields matching the approved master or an identical pending proposal are
 * skipped, and nothing here touches approved revisions.
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
    const approved = new Map((latestRevision?.fields ?? []).map(field => [`${field.entryKey}\u0000${field.fieldKey}`, field.value]));
    const existing = await ctx.db.query("masterProposals").withIndex("by_event", q => q.eq("eventId", eventId)).collect();
    const pendingSet = new Set(existing.filter(p => p.state === "pending").map(p => `${p.entryKey}\u0000${p.fieldKey}\u0000${p.proposedValue}`));
    const entryKeys = uniqueEntryKeys(items.map(item => entryKeyFor(item.fields)));
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
        if (approved.get(`${entryKey}\u0000${field.key}`) === field.value) { skipped++; continue; }
        const dedupeKey = `${entryKey}\u0000${field.key}\u0000${field.value}`;
        if (pendingSet.has(dedupeKey)) { skipped++; continue; }
        pendingSet.add(dedupeKey);
        await ctx.db.insert("masterProposals", {
          eventId, snapshotId, entryKey, fieldKey: field.key, proposedValue: field.value,
          snippet: field.evidence.snippet, origin: field.origin, confidence: field.confidence,
          state: "pending", createdAt: Date.now(),
        });
        created++;
      }
    }
    return { created, skipped };
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

export const approve = mutation({
  args: { proposalId: v.id("masterProposals") },
  handler: async (ctx, { proposalId }) => {
    const proposal = await ctx.db.get(proposalId);
    if (!proposal) throw new Error("Access denied");
    const { userId } = await eventAccess(ctx, proposal.eventId, "edit");
    if (proposal.state !== "pending") throw new Error("Proposal already decided");
    const masterRevisionId = await nextRevision(ctx, proposal.eventId, userId, [{ entryKey: proposal.entryKey, fieldKey: proposal.fieldKey, value: proposal.proposedValue, origin: "source", snapshotId: proposal.snapshotId }]);
    await ctx.db.patch(proposalId, { state: "approved", decidedBy: userId, decidedAt: Date.now() });
    await ctx.db.insert("masterDecisions", { eventId: proposal.eventId, proposalId, kind: "approve", actor: userId, at: Date.now(), masterRevisionId });
    return masterRevisionId;
  },
});

/** Batch approval: one new master revision covering every decided field. */
export const approveMany = mutation({
  args: { eventId: v.id("events"), proposalIds: v.array(v.id("masterProposals")) },
  handler: async (ctx, { eventId, proposalIds }) => {
    const { userId } = await eventAccess(ctx, eventId, "edit");
    if (!proposalIds.length || proposalIds.length > 500) throw new Error("Invalid batch size");
    const proposals: Doc<"masterProposals">[] = [];
    for (const proposalId of [...new Set(proposalIds)]) {
      const proposal = await ctx.db.get(proposalId);
      if (!proposal || proposal.eventId !== eventId) throw new Error("Access denied");
      if (proposal.state === "pending") proposals.push(proposal);
    }
    if (!proposals.length) return null;
    const targets = new Map<string, string>();
    for (const proposal of proposals) {
      const key = `${proposal.entryKey}\u0000${proposal.fieldKey}`;
      const prior = targets.get(key);
      if (prior !== undefined && prior !== proposal.proposedValue) throw new Error("Conflicting proposals in one batch; decide those fields individually");
      targets.set(key, proposal.proposedValue);
    }
    const masterRevisionId = await nextRevision(ctx, eventId, userId, proposals.map(proposal => ({
      entryKey: proposal.entryKey, fieldKey: proposal.fieldKey, value: proposal.proposedValue, origin: "source" as const, snapshotId: proposal.snapshotId,
    })));
    for (const proposal of proposals) {
      await ctx.db.patch(proposal._id, { state: "approved", decidedBy: userId, decidedAt: Date.now() });
      await ctx.db.insert("masterDecisions", { eventId, proposalId: proposal._id, kind: "approve", actor: userId, at: Date.now(), masterRevisionId });
    }
    return masterRevisionId;
  },
});

export const reject = mutation({
  args: { proposalId: v.id("masterProposals") },
  handler: async (ctx, { proposalId }) => {
    const proposal = await ctx.db.get(proposalId);
    if (!proposal) throw new Error("Access denied");
    const { userId } = await eventAccess(ctx, proposal.eventId, "edit");
    if (proposal.state !== "pending") throw new Error("Proposal already decided");
    await ctx.db.patch(proposalId, { state: "rejected", decidedBy: userId, decidedAt: Date.now() });
    await ctx.db.insert("masterDecisions", { eventId: proposal.eventId, proposalId, kind: "reject", actor: userId, at: Date.now() });
  },
});

export const rejectMany = mutation({
  args: { eventId: v.id("events"), proposalIds: v.array(v.id("masterProposals")) },
  handler: async (ctx, { eventId, proposalIds }) => {
    const { userId } = await eventAccess(ctx, eventId, "edit");
    if (!proposalIds.length || proposalIds.length > 500) throw new Error("Invalid batch size");
    for (const proposalId of [...new Set(proposalIds)]) {
      const proposal = await ctx.db.get(proposalId);
      if (!proposal || proposal.eventId !== eventId) throw new Error("Access denied");
      if (proposal.state !== "pending") continue;
      await ctx.db.patch(proposalId, { state: "rejected", decidedBy: userId, decidedAt: Date.now() });
      await ctx.db.insert("masterDecisions", { eventId, proposalId, kind: "reject", actor: userId, at: Date.now() });
    }
  },
});

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
