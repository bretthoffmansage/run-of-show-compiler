/**
 * Authorization domain contract for server use only. A principal must come from
 * a verified server-side identity adapter, never a request body or browser prop.
 * This module is not a session verifier or a database repository.
 */
export type Role = "admin" | "operator" | "viewer";
export type Action = "read" | "edit" | "admin";

export interface VerifiedPrincipal {
  readonly userId: string;
  readonly verifiedBy: string;
}

export interface Membership {
  readonly userId: string;
  readonly organizationId: string;
  readonly role: Role;
}

export interface EventScope {
  readonly id: string;
  readonly organizationId: string;
}

export class AccessDeniedError extends Error {
  constructor() {
    super("Access denied");
    this.name = "AccessDeniedError";
  }
}

function hasIdentity(principal: VerifiedPrincipal | null | undefined): principal is VerifiedPrincipal {
  return Boolean(principal?.userId?.trim() && principal?.verifiedBy?.trim());
}

function rolePermits(role: Role, action: Action): boolean {
  if (role !== "admin" && role !== "operator" && role !== "viewer") return false;
  if (action === "read") return true;
  if (action === "edit") return role === "admin" || role === "operator";
  return action === "admin" && role === "admin";
}

export function requireOrganizationAccess(
  principal: VerifiedPrincipal | null | undefined,
  membership: Membership | null | undefined,
  organizationId: string,
  action: Action,
): void {
  if (
    !hasIdentity(principal) ||
    !organizationId ||
    membership?.userId !== principal.userId ||
    membership.organizationId !== organizationId ||
    !rolePermits(membership.role, action)
  ) {
    throw new AccessDeniedError();
  }
}

export function requireEventAccess(
  principal: VerifiedPrincipal | null | undefined,
  membership: Membership | null | undefined,
  event: EventScope | null | undefined,
  organizationId: string,
  action: Action,
): void {
  if (!event?.id || event.organizationId !== organizationId) throw new AccessDeniedError();
  requireOrganizationAccess(principal, membership, organizationId, action);
}
