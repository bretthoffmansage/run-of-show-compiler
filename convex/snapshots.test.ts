/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { diffText } from "../lib/snapshot-diff";

const modules = import.meta.glob("./**/*.ts");

async function fixture() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "alice", issuer: "https://identity.test", tokenIdentifier: "alice-token" });
  const bob = t.withIdentity({ subject: "bob", issuer: "https://identity.test", tokenIdentifier: "bob-token" });
  const organizationId = await alice.mutation(api.organizations.create, { name: "SAGE" });
  const eventId = await alice.mutation(api.events.create, { organizationId, name: "Summit" });
  const sourceId = await alice.mutation(api.sources.create, { eventId, name: "Agenda", provider: "google_docs", url: "https://docs.google.com/document/d/abc/edit" });
  return { t, alice, bob, sourceId };
}

describe("immutable source snapshots", () => {
  it("captures initial/later revisions, deduplicates, and exposes a reviewable diff", async () => {
    const { t, alice, bob, sourceId } = await fixture();
    const first = await t.mutation(internal.snapshots.capture, { sourceId, revision: "r1", content: "Opening\nHost: Ava\nBreak" });
    expect(first.duplicate).toBe(false);
    const duplicate = await t.mutation(internal.snapshots.capture, { sourceId, revision: "r1", content: "Opening\nHost: Ava\nBreak" });
    expect(duplicate).toEqual({ snapshotId: first.snapshotId, duplicate: true });
    await expect(t.mutation(internal.snapshots.capture, { sourceId, revision: "r1", content: "different" })).rejects.toThrow("Revision content mismatch");
    const second = await t.mutation(internal.snapshots.capture, { sourceId, revision: "r2", content: "Opening\nHost: Bea\nBreak" });
    expect((await alice.query(api.snapshots.list, { sourceId })).map(s => s.revision)).toEqual(["r2", "r1"]);
    expect(await alice.query(api.snapshots.diff, { fromId: first.snapshotId, toId: second.snapshotId })).toMatchObject({ fromRevision: "r1", toRevision: "r2", startLine: 2, removed: ["Host: Ava"], added: ["Host: Bea"] });
    expect((await alice.query(api.snapshots.latest, { sourceId }))?.content).toBe("Opening\nHost: Bea\nBreak");
    await expect(bob.query(api.snapshots.latest, { sourceId })).rejects.toThrow("Access denied");
  });

  it("retains last good snapshot after a failed capture and archives source metadata without deleting history", async () => {
    const { t, alice, sourceId } = await fixture();
    const first = await t.mutation(internal.snapshots.capture, { sourceId, revision: "r1", content: "Day 1" });
    await expect(t.mutation(internal.snapshots.capture, { sourceId, revision: "r2", content: "x".repeat(70_000) })).rejects.toThrow("Snapshot too large");
    expect((await alice.query(api.snapshots.latest, { sourceId }))?._id).toBe(first.snapshotId);
    await alice.mutation(api.sources.remove, { sourceId });
    expect((await alice.query(api.snapshots.latest, { sourceId }))?.content).toBe("Day 1");
    await expect(t.mutation(internal.snapshots.capture, { sourceId, revision: "r2", content: "Day 2" })).rejects.toThrow("Unknown source");
  });

  it("does not invent semantic changes when text is identical", () => {
    expect(diffText("A\nB", "A\nB")).toEqual({ startLine: 3, removed: [], added: [], changedLines: 0 });
  });
});
