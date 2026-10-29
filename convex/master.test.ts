/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

process.env.ALLOWED_SIGNIN_DOMAINS = "test.sage";

const CONTENT = "09:00 Opening with Ava\n09:30 Break";

async function fixture() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "alice", issuer: "https://identity.test", tokenIdentifier: "alice-token", email: "alice@test.sage" });
  const bob = t.withIdentity({ subject: "bob", issuer: "https://identity.test", tokenIdentifier: "bob-token", email: "bob@test.sage" });
  const organizationId = await alice.mutation(api.organizations.create, { name: "SAGE" });
  const eventId = await alice.mutation(api.events.create, { organizationId, name: "Summit" });
  const sourceId = await alice.mutation(api.sources.create, { eventId, name: "Schedule", url: "https://docs.google.com/document/d/abc/edit" });
  const { snapshotId } = await t.mutation(internal.snapshots.capture, { sourceId, revision: "r1", content: CONTENT });
  const field = (key: "title" | "start_time", value: string, overrides: Partial<{ snippet: string; origin: "source_exact" | "inferred"; confidence: number; revision: string; sourceId: string }> = {}) => ({
    key, value, origin: overrides.origin ?? "source_exact" as const, confidence: overrides.confidence ?? 0.8,
    evidence: { sourceId: overrides.sourceId ?? String(sourceId), revision: overrides.revision ?? "r1", snippet: overrides.snippet ?? "09:00 Opening with Ava" },
  });
  return { t, alice, bob, eventId, organizationId, sourceId, snapshotId, field };
}

describe("zero-click compile and immutable master history", () => {
  it("compiles extraction output immediately and recompiles edits as new immutable revisions", async () => {
    const { t, alice, eventId, sourceId, snapshotId, field } = await fixture();
    expect(await alice.query(api.master.latest, { eventId })).toBeNull();

    const first = await t.mutation(internal.master.ingestExtraction, {
      eventId, snapshotId, items: [{ fields: [field("title", "Opening"), field("start_time", "09:00")] }],
    });
    expect(first).toMatchObject({ created: 2, applied: 2 });
    const revision = await alice.query(api.master.latest, { eventId });
    expect(revision?.number).toBe(1);
    expect(revision?.approvedBy).toBe("auto-compiler");
    const title = revision?.fields.find(f => f.fieldKey === "title");
    expect(title).toMatchObject({ value: "Opening", origin: "source" });
    expect(title?.conflict).toBeUndefined();
    expect(title?.changedAt).toBeUndefined();
    const proposals = await alice.query(api.master.listProposals, { eventId });
    expect(proposals).toHaveLength(2);
    expect(proposals.every(p => p.state === "approved" && p.decidedBy === "auto-compiler")).toBe(true);

    // The source retitles the same slot: a new revision records the change
    // (pink), while the prior revision stays untouched in history.
    const { snapshotId: second } = await t.mutation(internal.snapshots.capture, { sourceId, revision: "r2", content: "09:00 Welcome with Ava\n09:30 Break" });
    await t.mutation(internal.master.ingestExtraction, {
      eventId, snapshotId: second, items: [{ fields: [field("title", "Welcome", { snippet: "09:00 Welcome with Ava", revision: "r2" }), field("start_time", "09:00", { snippet: "09:00 Welcome with Ava", revision: "r2" })] }],
    });
    const history = await alice.query(api.master.history, { eventId });
    expect(history.revisions).toHaveLength(2);
    const byNumber = (n: number) => history.revisions.find(r => r.number === n)!;
    expect(byNumber(2).fields.find(f => f.fieldKey === "title")).toMatchObject({ value: "Welcome" });
    expect(byNumber(2).fields.find(f => f.fieldKey === "title")?.changedAt).toBeTypeOf("number");
    expect(byNumber(1).fields.find(f => f.fieldKey === "title")).toMatchObject({ value: "Opening" });
    expect(history.decisions.every(d => d.kind === "approve" && d.actor === "auto-compiler")).toBe(true);
  });

  it("skips invalid evidence instead of compiling it", async () => {
    const { t, alice, eventId, snapshotId, field } = await fixture();
    const result = await t.mutation(internal.master.ingestExtraction, {
      eventId, snapshotId, items: [{
        fields: [
          field("title", "Invented", { snippet: "not in the source" }),
          field("title", "Opening", { snippet: "09:00 Opening with Ava", revision: "wrong-revision" }),
          field("title", "Mismatch", { snippet: "09:30 Break", origin: "source_exact" }),
        ],
      }],
    });
    expect(result).toMatchObject({ created: 0, applied: 0, skipped: 3 });
    expect(await alice.query(api.master.latest, { eventId })).toBeNull();
    expect(await alice.query(api.master.listProposals, { eventId })).toHaveLength(0);
  });

  it("enforces viewer and cross-tenant boundaries on reads and manual edits", async () => {
    const { t, alice, bob, eventId, organizationId, snapshotId, field } = await fixture();
    await t.mutation(internal.master.ingestExtraction, { eventId, snapshotId, items: [{ fields: [field("title", "Opening"), field("start_time", "09:00")] }] });
    await expect(bob.query(api.master.listProposals, { eventId })).rejects.toThrow("Access denied");
    await expect(bob.query(api.master.latest, { eventId })).rejects.toThrow("Access denied");
    await t.run(async ctx => { await ctx.db.insert("memberships", { organizationId, userId: "bob-token", role: "viewer" }); });
    expect(await bob.query(api.master.listProposals, { eventId })).toHaveLength(2);
    await expect(bob.mutation(api.master.manualEdit, { eventId, entryKey: "nodate_09:00", fieldKey: "title", value: "Bad" })).rejects.toThrow("Access denied");

    // Operator corrections stay possible (that is editing, not approving) and
    // append a new revision without mutating the compiled one.
    await alice.mutation(api.master.manualEdit, { eventId, entryKey: "nodate_09:00", fieldKey: "title", value: "Opening ceremony" });
    const history = await alice.query(api.master.history, { eventId });
    expect(history.revisions).toHaveLength(2);
    const byNumber = (n: number) => history.revisions.find(r => r.number === n)!;
    expect(byNumber(2).fields.find(f => f.fieldKey === "title")).toMatchObject({ value: "Opening ceremony", origin: "operator" });
    expect(byNumber(1).fields.find(f => f.fieldKey === "title")).toMatchObject({ value: "Opening", origin: "source" });
    expect(history.decisions.some(d => d.kind === "manual_edit")).toBe(true);
  });
});
