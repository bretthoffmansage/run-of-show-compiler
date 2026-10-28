/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

process.env.ALLOWED_SIGNIN_DOMAINS = "test.sage";
delete process.env.ANTHROPIC_API_KEY;

describe("single-operator manual source flow", () => {
  it("captures a static source, proposes via scheduled extraction, and gates decisions", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      const operator = t.withIdentity({ subject: "internal-operator", issuer: "http://localhost:3000", tokenIdentifier: "operator", email: "operator@test.sage" });
      const outsider = t.withIdentity({ subject: "outsider", issuer: "http://localhost:3000", tokenIdentifier: "outsider", email: "outsider@test.sage" });
      const organizationId = await operator.mutation(api.organizations.create, { name: "SAGE" });
      expect((await operator.query(api.organizations.get, { organizationId })).name).toBe("SAGE");
      await expect(outsider.query(api.organizations.get, { organizationId })).rejects.toThrow("Access denied");
      const eventId = await operator.mutation(api.events.create, { organizationId, name: "Summit" });
      const { sourceId, snapshotId } = await operator.mutation(api.sources.createManualWithSnapshot, { eventId, name: "Working notes", content: "2026-11-03 09:00 Opening\nSession without time" });
      expect((await operator.query(api.sources.list, { eventId }))[0]).toMatchObject({ _id: sourceId, provider: "manual", state: "static" });
      expect((await operator.query(api.snapshots.latest, { sourceId }))?.content).toContain("Opening");
      expect((await operator.query(api.snapshots.getProvenance, { snapshotId })).sourceName).toBe("Working notes");
      await expect(outsider.query(api.snapshots.getProvenance, { snapshotId })).rejects.toThrow("Access denied");

      // The scheduled extraction (deterministic fallback: no API key) creates pending proposals.
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const runs = await operator.query(api.extraction.recentForEvent, { eventId });
      expect(runs[0]).toMatchObject({ status: "succeeded", engine: "fallback" });
      expect(await operator.query(api.master.latest, { eventId })).toBeNull();
      const proposals = await operator.query(api.master.listProposals, { eventId });
      expect(proposals).toHaveLength(4);
      expect(proposals.find(p => p.proposedValue === "Session without time")?.fieldKey).toBe("title");
      await expect(outsider.query(api.master.listProposals, { eventId })).rejects.toThrow("Access denied");

      const titleProposal = proposals.find(p => p.fieldKey === "title")!;
      await expect(outsider.mutation(api.master.approve, { proposalId: titleProposal._id })).rejects.toThrow("Access denied");
      await operator.mutation(api.master.approve, { proposalId: titleProposal._id });
      expect((await operator.query(api.master.latest, { eventId }))?.number).toBe(1);
      await expect(outsider.query(api.master.latest, { eventId })).rejects.toThrow("Access denied");

      // Re-capturing identical manual content produces no duplicate pending proposals.
      await operator.mutation(api.snapshots.captureManual, { sourceId, content: "2026-11-03 09:00 Opening\nSession without time" });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const after = await operator.query(api.master.listProposals, { eventId });
      expect(after.filter(p => p.state === "pending")).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("supports batch approval of non-conflicting pending fields in one revision", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      const operator = t.withIdentity({ subject: "op", issuer: "http://localhost:3000", tokenIdentifier: "op", email: "op@test.sage" });
      const organizationId = await operator.mutation(api.organizations.create, { name: "SAGE" });
      const eventId = await operator.mutation(api.events.create, { organizationId, name: "Summit" });
      await operator.mutation(api.sources.createManualWithSnapshot, { eventId, name: "Notes", content: "2026-11-03 09:00 Opening\n2026-11-03 10:00 Keynote" });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const pending = (await operator.query(api.master.listProposals, { eventId })).filter(p => p.state === "pending");
      expect(pending.length).toBe(6);
      await operator.mutation(api.master.approveMany, { eventId, proposalIds: pending.map(p => p._id) });
      const revision = await operator.query(api.master.latest, { eventId });
      expect(revision?.number).toBe(1);
      expect(revision?.fields).toHaveLength(6);
      expect((await operator.query(api.master.listProposals, { eventId })).every(p => p.state === "approved")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
