/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
process.env.ALLOWED_SIGNIN_DOMAINS = "test.sage";

describe("deleting an event", () => {
  it("lets an org admin delete it; it vanishes and its sources stop syncing", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: "alice", issuer: "https://identity.test", tokenIdentifier: "alice-token", email: "alice@test.sage" });
    const bob = t.withIdentity({ subject: "bob", issuer: "https://identity.test", tokenIdentifier: "bob-token", email: "bob@test.sage" });
    const organizationId = await alice.mutation(api.organizations.create, { name: "SAGE" });
    const eventId = await alice.mutation(api.events.create, { organizationId, name: "test" });
    const sourceId = await alice.mutation(api.sources.createManual, { eventId, name: "Notes" });

    // A viewer can't delete.
    await t.run(async ctx => { await ctx.db.insert("memberships", { organizationId, userId: "bob-token", role: "viewer" }); });
    await expect(bob.mutation(api.events.remove, { eventId })).rejects.toThrow("Access denied");

    expect(await alice.mutation(api.events.remove, { eventId })).toBe(organizationId);
    expect(await alice.query(api.events.list, { organizationId })).toHaveLength(0);
    await expect(alice.query(api.events.get, { eventId })).rejects.toThrow("Access denied");
    expect((await t.run(ctx => ctx.db.get(sourceId)) as { archived?: boolean } | null)?.archived).toBe(true);
  });
});
