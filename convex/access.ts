import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireEventAccess, requireOrganizationAccess, type Action, type Membership } from "../lib/tenant-access";

type Ctx = QueryCtx | MutationCtx;

export async function identityId(ctx: Ctx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.tokenIdentifier) throw new Error("Access denied");
  return identity.tokenIdentifier;
}

export async function organizationAccess(ctx: Ctx, organizationId: Id<"organizations">, action: Action) {
  const userId = await identityId(ctx);
  const organization = await ctx.db.get(organizationId);
  const member = await ctx.db.query("memberships").withIndex("by_org_user", q => q.eq("organizationId", organizationId).eq("userId", userId)).unique();
  if (!organization || organization.archived) throw new Error("Access denied");
  requireOrganizationAccess({ userId, verifiedBy: "convex-auth" }, member as Membership | null, organizationId, action);
  return { userId, organization };
}

export async function eventAccess(ctx: Ctx, eventId: Id<"events">, action: Action) {
  const userId = await identityId(ctx);
  const event = await ctx.db.get(eventId);
  if (!event || event.archived) throw new Error("Access denied");
  const organization = await ctx.db.get(event.organizationId);
  const member = await ctx.db.query("memberships").withIndex("by_org_user", q => q.eq("organizationId", event.organizationId).eq("userId", userId)).unique();
  if (!organization || organization.archived) throw new Error("Access denied");
  requireEventAccess({ userId, verifiedBy: "convex-auth" }, member as Membership | null, { id: eventId, organizationId: event.organizationId }, event.organizationId, action);
  return { userId, event };
}
