import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { eventAccess, organizationAccess } from "./access";

export const create = mutation({
  args: { organizationId: v.id("organizations"), name: v.string() },
  handler: async (ctx, { organizationId, name }) => {
    await organizationAccess(ctx, organizationId, "admin");
    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 120) throw new Error("Invalid event name");
    return ctx.db.insert("events", { organizationId, name: cleanName, archived: false });
  },
});

export const list = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await organizationAccess(ctx, organizationId, "read");
    return (await ctx.db.query("events").withIndex("by_org", q => q.eq("organizationId", organizationId)).collect()).filter(e => !e.archived);
  },
});

export const get = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const { event } = await eventAccess(ctx, eventId, "read");
    return event;
  },
});

/**
 * Delete an event (org admins only, same as creating one). The event is
 * archived: it disappears from every list and page, its sources stop
 * syncing, and its playbook stops updating; the Google Sheet itself is
 * left in Drive untouched.
 */
export const remove = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const { event } = await eventAccess(ctx, eventId, "admin");
    await ctx.db.patch(eventId, { archived: true });
    for (const source of await ctx.db.query("sources").withIndex("by_event", q => q.eq("eventId", eventId)).collect()) {
      if (!source.archived) await ctx.db.patch(source._id, { archived: true });
    }
    return event.organizationId;
  },
});
