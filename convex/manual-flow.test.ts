/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("single-operator manual source flow", () => {
  it("captures a static source, proposes without approval, and gates decisions", async () => {
    const t = convexTest(schema, modules);
    const operator = t.withIdentity({ subject: "internal-operator", issuer: "http://localhost:3000", tokenIdentifier: "operator" });
    const outsider = t.withIdentity({ subject: "outsider", issuer: "http://localhost:3000", tokenIdentifier: "outsider" });
    const organizationId = await operator.mutation(api.organizations.create, { name: "SAGE" });
    const eventId = await operator.mutation(api.events.create, { organizationId, name: "Summit" });
    const { sourceId, snapshotId } = await operator.mutation(api.sources.createManualWithSnapshot, { eventId, name: "Working notes", content: "2026-11-03 09:00 Opening\nSession without time" });
    expect((await operator.query(api.sources.list, { eventId }))[0]).toMatchObject({ _id: sourceId, provider: "manual", state: "static" });
    expect((await operator.query(api.snapshots.latest, { sourceId }))?.content).toContain("Opening");
    expect((await operator.query(api.snapshots.getProvenance, { snapshotId })).sourceName).toBe("Working notes");
    await expect(outsider.query(api.snapshots.getProvenance, { snapshotId })).rejects.toThrow("Access denied");
    await expect(outsider.mutation(api.master.proposeManualSnapshot, { snapshotId })).rejects.toThrow("Access denied");
    expect(await operator.mutation(api.master.proposeManualSnapshot, { snapshotId })).toBe(4);
    expect(await operator.mutation(api.master.proposeManualSnapshot, { snapshotId })).toBe(4);
    expect(await operator.query(api.master.latest, { eventId })).toBeNull();
    const proposals = await operator.query(api.master.listProposals, { eventId });
    expect(proposals).toHaveLength(4);
    expect(proposals.find(p => p.proposedValue === "Session without time")?.fieldKey).toBe("title");
    await operator.mutation(api.master.approve, { proposalId: proposals.find(p => p.fieldKey === "title")!._id });
    expect((await operator.query(api.master.latest, { eventId }))?.number).toBe(1);
    await expect(outsider.query(api.master.latest, { eventId })).rejects.toThrow("Access denied");
  });
});
