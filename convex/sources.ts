import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { eventAccess } from "./access";

const provider = v.union(v.literal("google_docs"), v.literal("google_sheets"));

function validGoogleUrl(value: string, providerName: "google_docs" | "google_sheets"): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Invalid Google source URL"); }
  const prefix = providerName === "google_docs" ? "/document/d/" : "/spreadsheets/d/";
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com" || !url.pathname.startsWith(prefix) || !url.pathname.slice(prefix.length).split("/")[0]) {
    throw new Error("Invalid Google source URL");
  }
  return url.toString();
}

export const create = mutation({
  args: { eventId: v.id("events"), name: v.string(), provider, url: v.string() },
  handler: async (ctx, args) => {
    const { event, userId } = await eventAccess(ctx, args.eventId, "edit");
    const name = args.name.trim();
    if (!name || name.length > 120) throw new Error("Invalid source name");
    const url = validGoogleUrl(args.url, args.provider);
    return ctx.db.insert("sources", { organizationId: event.organizationId, eventId: args.eventId, name, provider: args.provider, url, state: "not_connected", archived: false, createdBy: userId });
  },
});

export const createManual = mutation({
  args: { eventId: v.id("events"), name: v.string() },
  handler: async (ctx, { eventId, name }) => {
    const { event, userId } = await eventAccess(ctx, eventId, "edit");
    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 120) throw new Error("Invalid source name");
    return ctx.db.insert("sources", { organizationId: event.organizationId, eventId, name: cleanName, provider: "manual", url: "", state: "static", archived: false, createdBy: userId });
  },
});

export const createManualWithSnapshot = mutation({
  args: { eventId: v.id("events"), name: v.string(), content: v.string() },
  handler: async (ctx, { eventId, name, content }) => {
    const { event, userId } = await eventAccess(ctx, eventId, "edit");
    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 120 || !content.trim() || new TextEncoder().encode(content).length > 64 * 1024) throw new Error("Invalid source input");
    const sourceId = await ctx.db.insert("sources", { organizationId: event.organizationId, eventId, name: cleanName, provider: "manual", url: "", state: "static", archived: false, createdBy: userId });
    const snapshotId = await ctx.db.insert("sourceSnapshots", { sourceId, revision: `manual:${crypto.randomUUID()}`, content, capturedAt: Date.now(), changedLines: content.split("\n").length });
    return { sourceId, snapshotId };
  },
});

export const list = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    await eventAccess(ctx, eventId, "read");
    return (await ctx.db.query("sources").withIndex("by_event", q => q.eq("eventId", eventId)).collect()).filter(s => !s.archived);
  },
});

export const rename = mutation({
  args: { sourceId: v.id("sources"), name: v.string() },
  handler: async (ctx, { sourceId, name }) => {
    const source = await ctx.db.get(sourceId);
    if (!source || source.archived) throw new Error("Access denied");
    await eventAccess(ctx, source.eventId, "edit");
    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 120) throw new Error("Invalid source name");
    await ctx.db.patch(sourceId, { name: cleanName });
  },
});

export const pause = mutation({
  args: { sourceId: v.id("sources"), paused: v.boolean() },
  handler: async (ctx, { sourceId, paused }) => {
    const source = await ctx.db.get(sourceId);
    if (!source || source.archived) throw new Error("Access denied");
    await eventAccess(ctx, source.eventId, "edit");
    await ctx.db.patch(sourceId, { state: paused ? "paused" : source.provider === "manual" ? "static" : "not_connected" });
  },
});

export const remove = mutation({
  args: { sourceId: v.id("sources") },
  handler: async (ctx, { sourceId }) => {
    const source = await ctx.db.get(sourceId);
    if (!source || source.archived) throw new Error("Access denied");
    await eventAccess(ctx, source.eventId, "edit");
    // Preserve revision history until an explicit retention/deletion policy is approved.
    await ctx.db.patch(sourceId, { archived: true });
  },
});
