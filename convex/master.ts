import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { eventAccess } from "./access";
import type { Doc, Id } from "./_generated/dataModel";

const fieldName = v.union(
  v.literal("day"), v.literal("date"), v.literal("start_time"), v.literal("end_time"),
  v.literal("duration"), v.literal("time_zone"), v.literal("title"), v.literal("type"),
  v.literal("speaker"), v.literal("audience"), v.literal("script"), v.literal("stage_direction"),
  v.literal("video"), v.literal("slides"), v.literal("audio"), v.literal("production_note"),
  v.literal("break"), v.literal("source_order"), v.literal("dependency"), v.literal("additional_detail"),
);

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

async function nextRevision(ctx: MutationCtx, eventId: Id<"events">, actor: string, newField: Doc<"masterRevisions">["fields"][number]) {
  const previous = await ctx.db.query("masterRevisions").withIndex("by_event", q => q.eq("eventId", eventId)).order("desc").first();
  const fields = (previous?.fields ?? []).filter(field => !(field.entryKey === newField.entryKey && field.fieldKey === newField.fieldKey));
  return ctx.db.insert("masterRevisions", { eventId, number: (previous?.number ?? 0) + 1, fields: [...fields, newField], createdAt: Date.now(), approvedBy: actor });
}

export const approve = mutation({
  args: { proposalId: v.id("masterProposals") },
  handler: async (ctx, { proposalId }) => {
    const proposal = await ctx.db.get(proposalId);
    if (!proposal) throw new Error("Access denied");
    const { userId } = await eventAccess(ctx, proposal.eventId, "edit");
    if (proposal.state !== "pending") throw new Error("Proposal already decided");
    const masterRevisionId = await nextRevision(ctx, proposal.eventId, userId, { entryKey: proposal.entryKey, fieldKey: proposal.fieldKey, value: proposal.proposedValue, origin: "source", snapshotId: proposal.snapshotId });
    await ctx.db.patch(proposalId, { state: "approved", decidedBy: userId, decidedAt: Date.now() });
    await ctx.db.insert("masterDecisions", { eventId: proposal.eventId, proposalId, kind: "approve", actor: userId, at: Date.now(), masterRevisionId });
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

export const manualEdit = mutation({
  args: { eventId: v.id("events"), entryKey: v.string(), fieldKey: fieldName, value: v.string() },
  handler: async (ctx, { eventId, entryKey, fieldKey, value }) => {
    const { userId } = await eventAccess(ctx, eventId, "edit");
    if (!validText(entryKey, 200) || !validText(value)) throw new Error("Invalid manual value");
    const masterRevisionId = await nextRevision(ctx, eventId, userId, { entryKey, fieldKey, value, origin: "operator" });
    await ctx.db.insert("masterDecisions", { eventId, kind: "manual_edit", actor: userId, at: Date.now(), masterRevisionId });
    return masterRevisionId;
  },
});
