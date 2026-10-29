/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

process.env.ALLOWED_SIGNIN_DOMAINS = "test.sage";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.AI_GATEWAY_API_KEY;

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

      // The scheduled extraction (deterministic fallback: no API key) compiles
      // straight into the master — zero approval clicks.
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const runs = await operator.query(api.extraction.recentForEvent, { eventId });
      expect(runs[0]).toMatchObject({ status: "succeeded", engine: "fallback" });
      const compiled = await operator.query(api.master.latest, { eventId });
      expect(compiled?.number).toBe(1);
      expect(compiled?.fields.some(f => f.value === "Session without time")).toBe(true);
      const proposals = await operator.query(api.master.listProposals, { eventId });
      expect(proposals).toHaveLength(4);
      expect(proposals.every(p => p.state === "approved" && p.decidedBy === "auto-compiler")).toBe(true);
      await expect(outsider.query(api.master.listProposals, { eventId })).rejects.toThrow("Access denied");
      await expect(outsider.query(api.master.latest, { eventId })).rejects.toThrow("Access denied");

      // Re-capturing identical manual content compiles nothing new.
      await operator.mutation(api.snapshots.captureManual, { sourceId, content: "2026-11-03 09:00 Opening\nSession without time" });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(await operator.query(api.master.listProposals, { eventId })).toHaveLength(4);
      expect((await operator.query(api.master.latest, { eventId }))?.number).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("compiles every extracted field into one revision with no operator action", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      const operator = t.withIdentity({ subject: "op", issuer: "http://localhost:3000", tokenIdentifier: "op", email: "op@test.sage" });
      const organizationId = await operator.mutation(api.organizations.create, { name: "SAGE" });
      const eventId = await operator.mutation(api.events.create, { organizationId, name: "Summit" });
      await operator.mutation(api.sources.createManualWithSnapshot, { eventId, name: "Notes", content: "2026-11-03 09:00 Opening\n2026-11-03 10:00 Keynote" });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const revision = await operator.query(api.master.latest, { eventId });
      expect(revision?.number).toBe(1);
      expect(revision?.fields).toHaveLength(6);
      expect(revision?.approvedBy).toBe("auto-compiler");
      // First compile: nothing is a conflict and nothing is marked as changed.
      expect(revision?.fields.every(f => !f.conflict && f.changedAt === undefined)).toBe(true);
      expect((await operator.query(api.master.listProposals, { eventId })).every(p => p.state === "approved" && p.decidedBy === "auto-compiler")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("flags disagreeing sources as conflicts and fresh edits as changes, without blocking the compile", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      const operator = t.withIdentity({ subject: "op", issuer: "http://localhost:3000", tokenIdentifier: "op", email: "op@test.sage" });
      const organizationId = await operator.mutation(api.organizations.create, { name: "SAGE" });
      const eventId = await operator.mutation(api.events.create, { organizationId, name: "Summit" });
      const { sourceId } = await operator.mutation(api.sources.createManualWithSnapshot, { eventId, name: "Client agenda", content: "2026-11-03 09:00 Opening" });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      // A second source claims a different title for the same slot: compile
      // proceeds, the latest capture wins the cell, and the field goes red.
      await operator.mutation(api.sources.createManualWithSnapshot, { eventId, name: "Producer notes", content: "2026-11-03 09:00 Opening Ceremony" });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const revision = await operator.query(api.master.latest, { eventId });
      const title = revision?.fields.find(f => f.fieldKey === "title" && f.entryKey.includes("09:00"));
      expect(title?.value).toBe("Opening Ceremony");
      expect(title?.conflict).toBe(true);
      expect(title?.changedAt).toBeTypeOf("number");
      // The first source edits its copy: the compile updates and stays marked.
      await operator.mutation(api.snapshots.captureManual, { sourceId, content: "2026-11-03 09:00 Opening Ceremony" });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const settled = await operator.query(api.master.latest, { eventId });
      const settledTitle = settled?.fields.find(f => f.fieldKey === "title" && f.entryKey.includes("09:00"));
      expect(settledTitle?.value).toBe("Opening Ceremony");
      expect(settledTitle?.conflict).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
