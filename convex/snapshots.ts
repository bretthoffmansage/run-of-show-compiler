import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { eventAccess } from "./access";
import { diffText } from "../lib/snapshot-diff";

const MAX_TEXT_BYTES = 64 * 1024;

/** Internal fixture/adapter entry point only. Never expose as a public mutation. */
export const capture = internalMutation({
  args: { sourceId: v.id("sources"), revision: v.string(), content: v.string() },
  handler: async (ctx, { sourceId, revision, content }) => {
    const source = await ctx.db.get(sourceId);
    if (!source || source.archived) throw new Error("Unknown source");
    const cleanRevision = revision.trim();
    if (!cleanRevision || cleanRevision.length > 200) throw new Error("Invalid revision");
    if (new TextEncoder().encode(content).length > MAX_TEXT_BYTES) throw new Error("Snapshot too large");
    const priorSameRevision = await ctx.db.query("sourceSnapshots").withIndex("by_source_revision", q => q.eq("sourceId", sourceId).eq("revision", cleanRevision)).unique();
    if (priorSameRevision) {
      if (priorSameRevision.content !== content) throw new Error("Revision content mismatch");
      return { snapshotId: priorSameRevision._id, duplicate: true };
    }
    const latest = await ctx.db.query("sourceSnapshots").withIndex("by_source", q => q.eq("sourceId", sourceId)).order("desc").first();
    const changedLines = latest ? diffText(latest.content, content).changedLines : content.split("\n").length;
    const snapshotId = await ctx.db.insert("sourceSnapshots", { sourceId, revision: cleanRevision, content, capturedAt: Date.now(), changedLines });
    return { snapshotId, duplicate: false };
  },
});

export const list = query({
  args: { sourceId: v.id("sources") },
  handler: async (ctx, { sourceId }) => {
    const source = await ctx.db.get(sourceId);
    if (!source) throw new Error("Access denied");
    await eventAccess(ctx, source.eventId, "read");
    const snapshots = await ctx.db.query("sourceSnapshots").withIndex("by_source", q => q.eq("sourceId", sourceId)).order("desc").collect();
    return snapshots.map(s => ({ _id: s._id, sourceId: s.sourceId, revision: s.revision, capturedAt: s.capturedAt, changedLines: s.changedLines }));
  },
});

export const latest = query({
  args: { sourceId: v.id("sources") },
  handler: async (ctx, { sourceId }) => {
    const source = await ctx.db.get(sourceId);
    if (!source) throw new Error("Access denied");
    await eventAccess(ctx, source.eventId, "read");
    return ctx.db.query("sourceSnapshots").withIndex("by_source", q => q.eq("sourceId", sourceId)).order("desc").first();
  },
});

export const diff = query({
  args: { fromId: v.id("sourceSnapshots"), toId: v.id("sourceSnapshots") },
  handler: async (ctx, { fromId, toId }) => {
    const from = await ctx.db.get(fromId);
    const to = await ctx.db.get(toId);
    if (!from || !to || from.sourceId !== to.sourceId) throw new Error("Access denied");
    const source = await ctx.db.get(from.sourceId);
    if (!source) throw new Error("Access denied");
    await eventAccess(ctx, source.eventId, "read");
    return { fromRevision: from.revision, toRevision: to.revision, ...diffText(from.content, to.content) };
  },
});
