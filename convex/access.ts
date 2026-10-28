import type { QueryCtx, MutationCtx, ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireEventAccess, requireOrganizationAccess, type Action, type Membership } from "../lib/tenant-access";
import { emailAllowed } from "../lib/signin-allowlist";

type Ctx = QueryCtx | MutationCtx;

export interface SignedInUser {
  userId: string;
  email: string;
}

/** Verified, allowlisted identity for any function kind, including actions. */
export async function signedInUser(ctx: Ctx | ActionCtx): Promise<SignedInUser> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.tokenIdentifier) throw new Error("Access denied");
  const email = typeof identity.email === "string" ? identity.email : null;
  if (!emailAllowed(email)) throw new Error("Access denied");
  return { userId: identity.tokenIdentifier, email: email! };
}

export async function identityId(ctx: Ctx | ActionCtx): Promise<string> {
  return (await signedInUser(ctx)).userId;
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
