import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { organizationAccess } from "./access";

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
