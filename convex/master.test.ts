/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

process.env.ALLOWED_SIGNIN_DOMAINS = "test.sage";

async function fixture() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "alice", issuer: "https://identity.test", tokenIdentifier: "alice-token", email: "alice@test.sage" });
  const bob = t.withIdentity({ subject: "bob", issuer: "https://identity.test", tokenIdentifier: "bob-token", email: "bob@test.sage" });
  const organizationId = await alice.mutation(api.organizations.create, { name: "SAGE" });
  const eventId = await alice.mutation(api.events.create, { organizationId, name: "Summit" });
  const sourceId = await alice.mutation(api.sources.create, { eventId, name: "Schedule", provider: "google_docs", url: "https://docs.google.com/document/d/abc/edit" });
  const { snapshotId } = await t.mutation(internal.snapshots.capture, { sourceId, revision: "r1", content: "09:00 Opening with Ava\n09:30 Break" });
  const propose = (proposedValue: string, snippet = "09:00 Opening with Ava") => t.mutation(internal.master.propose, { eventId, snapshotId, entryKey: "opening", fieldKey: "title", proposedValue, snippet, origin: "source_exact", confidence: 0.8 });
  return { t, alice, bob, eventId, organizationId, snapshotId, propose };
}

describe("proposal review and immutable master history", () => {
  it("does not change approved master on new proposal; explicit approval/rejection creates audit trail", async () => {
    const { t, alice, eventId, propose } = await fixture();
    const firstProposal = await propose("Opening");
    expect(await alice.query(api.master.latest, { eventId })).toBeNull();
    const firstRevisionId = await alice.mutation(api.master.approve, { proposalId: firstProposal });
    const firstRevision = await alice.query(api.master.latest, { eventId });
    expect(firstRevision).toMatchObject({ _id: firstRevisionId, number: 1, fields: [{ entryKey: "opening", fieldKey: "title", value: "Opening", origin: "source" }] });
    const secondProposal = await t.mutation(internal.master.propose, { eventId, snapshotId: firstRevision!.fields[0].snapshotId!, entryKey: "opening", fieldKey: "title", proposedValue: "Welcome", snippet: "09:00 Opening with Ava", origin: "inferred", confidence: 0.2 });
    expect((await alice.query(api.master.latest, { eventId }))?._id).toBe(firstRevisionId);
    await alice.mutation(api.master.reject, { proposalId: secondProposal });
    expect((await alice.query(api.master.latest, { eventId }))?._id).toBe(firstRevisionId);
    const history = await alice.query(api.master.history, { eventId });
    expect(history.revisions).toHaveLength(1);
    expect(history.decisions.map(d => d.kind)).toEqual(["reject", "approve"]);
    await expect(alice.mutation(api.master.approve, { proposalId: secondProposal })).rejects.toThrow("Proposal already decided");
  });

  it("records manual authorship in a new revision without mutating the old one", async () => {
    const { alice, eventId, propose } = await fixture();
    const proposalId = await propose("Opening");
    const firstId = await alice.mutation(api.master.approve, { proposalId });
    await alice.mutation(api.master.manualEdit, { eventId, entryKey: "opening", fieldKey: "title", value: "Opening ceremony" });
    const history = await alice.query(api.master.history, { eventId });
    expect(history.revisions).toHaveLength(2);
    expect(history.revisions[1]).toMatchObject({ _id: firstId, number: 1, fields: [{ value: "Opening", origin: "source" }] });
    expect(history.revisions[0]).toMatchObject({ number: 2, fields: [{ value: "Opening ceremony", origin: "operator" }] });
    expect(history.decisions[0].kind).toBe("manual_edit");
  });

  it("enforces viewer and cross-tenant boundaries and rejects unsupported evidence", async () => {
    const { t, alice, bob, eventId, organizationId, snapshotId, propose } = await fixture();
    const proposalId = await propose("Opening");
    await expect(bob.query(api.master.listProposals, { eventId })).rejects.toThrow("Access denied");
    await t.run(async ctx => { await ctx.db.insert("memberships", { organizationId, userId: "bob-token", role: "viewer" }); });
    expect(await bob.query(api.master.listProposals, { eventId })).toHaveLength(1);
    await expect(bob.mutation(api.master.approve, { proposalId })).rejects.toThrow("Access denied");
    await expect(bob.mutation(api.master.manualEdit, { eventId, entryKey: "opening", fieldKey: "title", value: "Bad" })).rejects.toThrow("Access denied");
    await expect(t.mutation(internal.master.propose, { eventId, snapshotId, entryKey: "opening", fieldKey: "title", proposedValue: "Invented", snippet: "not in source", origin: "source_exact", confidence: 1 })).rejects.toThrow("Invalid proposal evidence");
    expect(await alice.query(api.master.latest, { eventId })).toBeNull();
  });
});
