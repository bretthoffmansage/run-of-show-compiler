import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { identityId, organizationAccess } from "./access";

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await identityId(ctx);
    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 120) throw new Error("Invalid organization name");
    const organizationId = await ctx.db.insert("organizations", { name: cleanName, archived: false, createdBy: userId });
    await ctx.db.insert("memberships", { organizationId, userId, role: "admin" });
    return organizationId;
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await identityId(ctx);
    const memberships = await ctx.db.query("memberships").withIndex("by_user", q => q.eq("userId", userId)).collect();
    const organizations = await Promise.all(memberships.map(async m => ctx.db.get(m.organizationId)));
    return organizations.filter(o => o && !o.archived);
  },
});

export const get = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const { organization } = await organizationAccess(ctx, organizationId, "read");
    return organization;
  },
});

export const rename = mutation({
  args: { organizationId: v.id("organizations"), name: v.string() },
  handler: async (ctx, { organizationId, name }) => {
    await organizationAccess(ctx, organizationId, "admin");
    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 120) throw new Error("Invalid organization name");
    await ctx.db.patch(organizationId, { name: cleanName });
  },
});
