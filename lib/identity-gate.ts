import type { VerifiedPrincipal } from "./tenant-access";

/**
 * Fail-closed boundary until an approved SAGE identity adapter verifies a
 * server session. Future routes must obtain identity here, not from client data.
 */
export function requireVerifiedSession(): VerifiedPrincipal {
  throw new Error("Identity provider is not configured");
}
