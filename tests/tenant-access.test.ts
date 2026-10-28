import { describe, expect, it } from "vitest";
import {
  AccessDeniedError,
  requireEventAccess,
  requireOrganizationAccess,
  type Membership,
  type VerifiedPrincipal,
} from "../lib/tenant-access";

const alice: VerifiedPrincipal = { userId: "alice", verifiedBy: "test-adapter" };
const admin: Membership = { userId: "alice", organizationId: "sage", role: "admin" };
const operator: Membership = { ...admin, role: "operator" };
const viewer: Membership = { ...admin, role: "viewer" };
const sageEvent = { id: "event-1", organizationId: "sage" };

describe("tenant authorization contract", () => {
  it("fails closed without a verified principal", () => {
    expect(() => requireOrganizationAccess(null, admin, "sage", "read")).toThrow(AccessDeniedError);
    expect(() => requireOrganizationAccess({ ...alice, verifiedBy: "" }, admin, "sage", "read")).toThrow(AccessDeniedError);
  });

  it("denies non-members and organization mismatches", () => {
    expect(() => requireOrganizationAccess(alice, null, "sage", "read")).toThrow(AccessDeniedError);
    expect(() => requireOrganizationAccess(alice, { ...admin, userId: "bob" }, "sage", "read")).toThrow(AccessDeniedError);
    expect(() => requireOrganizationAccess(alice, admin, "other-org", "read")).toThrow(AccessDeniedError);
    expect(() => requireOrganizationAccess(alice, { ...admin, role: "unknown" as Membership["role"] }, "sage", "read")).toThrow(AccessDeniedError);
  });

  it("denies an event outside the requested organization", () => {
    expect(() => requireEventAccess(alice, admin, { id: "elsewhere", organizationId: "other-org" }, "sage", "read")).toThrow(AccessDeniedError);
    expect(() => requireEventAccess(alice, admin, sageEvent, "other-org", "read")).toThrow(AccessDeniedError);
    expect(() => requireEventAccess(alice, admin, null, "sage", "read")).toThrow(AccessDeniedError);
  });

  it("enforces viewer, operator, and administrator boundaries", () => {
    expect(() => requireEventAccess(alice, viewer, sageEvent, "sage", "read")).not.toThrow();
    expect(() => requireEventAccess(alice, viewer, sageEvent, "sage", "edit")).toThrow(AccessDeniedError);
    expect(() => requireEventAccess(alice, operator, sageEvent, "sage", "edit")).not.toThrow();
    expect(() => requireEventAccess(alice, operator, sageEvent, "sage", "admin")).toThrow(AccessDeniedError);
    expect(() => requireOrganizationAccess(alice, admin, "sage", "admin")).not.toThrow();
  });
});
