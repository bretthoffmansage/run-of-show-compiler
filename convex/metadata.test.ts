/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

process.env.ALLOWED_SIGNIN_DOMAINS = "test.sage";

describe("protected event and source metadata", () => {
  it("fails closed for unauthenticated organization creation and listing", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.organizations.create, { name: "SAGE" })).rejects.toThrow("Access denied");
    await expect(t.query(api.organizations.listMine, {})).rejects.toThrow("Access denied");
  });

  it("creates scoped organizations, events and explicitly unconnected source metadata", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: "alice", issuer: "https://identity.test", tokenIdentifier: "alice-token", email: "alice@test.sage" });
    const bob = t.withIdentity({ subject: "bob", issuer: "https://identity.test", tokenIdentifier: "bob-token", email: "bob@test.sage" });
    const org = await alice.mutation(api.organizations.create, { name: " SAGE " });
    expect(await alice.query(api.organizations.listMine, {})).toMatchObject([{ name: "SAGE" }]);
    expect(await bob.query(api.organizations.listMine, {})).toEqual([]);

    const event = await alice.mutation(api.events.create, { organizationId: org, name: " Summit " });
    expect((await alice.query(api.events.list, { organizationId: org }))[0].name).toBe("Summit");
    await expect(bob.query(api.events.list, { organizationId: org })).rejects.toThrow("Access denied");

    const source = await alice.mutation(api.sources.create, { eventId: event, name: "Agenda", provider: "google_docs", url: "https://docs.google.com/document/d/abc123/edit" });
    const listed = await alice.query(api.sources.list, { eventId: event });
    expect(listed).toMatchObject([{ _id: source, state: "not_connected", name: "Agenda" }]);
    await expect(bob.query(api.sources.list, { eventId: event })).rejects.toThrow("Access denied");
    await expect(bob.mutation(api.sources.remove, { sourceId: source })).rejects.toThrow("Access denied");

    await alice.mutation(api.sources.rename, { sourceId: source, name: "Main agenda" });
    await alice.mutation(api.sources.pause, { sourceId: source, paused: true });
    expect(await alice.query(api.sources.list, { eventId: event })).toMatchObject([{ name: "Main agenda", state: "paused" }]);
    await alice.mutation(api.sources.remove, { sourceId: source });
    expect(await alice.query(api.sources.list, { eventId: event })).toEqual([]);
  });

  it("rejects untrusted URLs and enforces viewer read-only access", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: "alice", issuer: "https://identity.test", tokenIdentifier: "alice-token", email: "alice@test.sage" });
    const bob = t.withIdentity({ subject: "bob", issuer: "https://identity.test", tokenIdentifier: "bob-token", email: "bob@test.sage" });
    const org = await alice.mutation(api.organizations.create, { name: "SAGE" });
    const event = await alice.mutation(api.events.create, { organizationId: org, name: "Summit" });
    await expect(alice.mutation(api.sources.create, { eventId: event, name: "Bad", provider: "google_docs", url: "https://docs.google.com.evil.test/document/d/abc" })).rejects.toThrow("doesn't look like a Google");
    await expect(alice.mutation(api.sources.create, { eventId: event, name: "Bad", provider: "google_sheets", url: "javascript:alert(1)" })).rejects.toThrow("doesn't look like a Google");

    await t.run(async ctx => { await ctx.db.insert("memberships", { organizationId: org, userId: "bob-token", role: "viewer" }); });
    expect(await bob.query(api.events.list, { organizationId: org })).toHaveLength(1);
    await expect(bob.mutation(api.sources.create, { eventId: event, name: "Agenda", provider: "google_sheets", url: "https://docs.google.com/spreadsheets/d/abc/edit" })).rejects.toThrow("Access denied");
  });
});
