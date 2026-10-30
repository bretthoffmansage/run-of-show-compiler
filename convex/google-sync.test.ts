/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { sealSecret } from "../lib/google-crypto";

const modules = import.meta.glob("./**/*.ts");

const CIPHER_KEY = Buffer.alloc(32, 5).toString("base64");
process.env.ALLOWED_SIGNIN_DOMAINS = "test.sage";
process.env.GOOGLE_CLIENT_ID = "client-id.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "client-secret";
process.env.GOOGLE_TOKEN_CIPHER_KEY = CIPHER_KEY;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.AI_GATEWAY_API_KEY;

const DOC_URL = "https://docs.google.com/document/d/abc123/edit";

function googleFetchMock(state: { docText: string; version: number; failWith?: number }) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "short-lived", expires_in: 3599 }), { status: 200 });
    }
    if (state.failWith) return new Response("denied", { status: state.failWith });
    if (url.startsWith("https://www.googleapis.com/drive/v3/files/abc123")) {
      return new Response(JSON.stringify({ id: "abc123", mimeType: "application/vnd.google-apps.document", version: String(state.version), modifiedTime: "2026-10-28T12:00:00Z", trashed: false }), { status: 200 });
    }
    if (url.startsWith("https://docs.googleapis.com/v1/documents/abc123")) {
      return new Response(JSON.stringify({ body: { content: [{ paragraph: { elements: [{ textRun: { content: state.docText } }] } }] } }), { status: 200 });
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  });
}

async function seedConnection(t: ReturnType<typeof convexTest>) {
  const sealed = await sealSecret("1//refresh-token", CIPHER_KEY);
  await t.run(async ctx => {
    await ctx.db.insert("googleConnections", {
      accountEmail: "studio@poweredbysage.com", encryptedRefreshToken: sealed,
      scopes: "openid email https://www.googleapis.com/auth/drive.readonly",
      connectedBy: "op", connectedAt: Date.now(), status: "active",
    });
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("google source sync pipeline", () => {
  it("captures, extracts, and re-syncs only on real changes", async () => {
    vi.useFakeTimers();
    try {
      const state = { docText: "2026-11-03 09:00 Opening\n2026-11-03 10:00 Keynote", version: 4 };
      vi.stubGlobal("fetch", googleFetchMock(state));
      const t = convexTest(schema, modules);
      await seedConnection(t);
      const operator = t.withIdentity({ subject: "op", issuer: "https://clerk.test", tokenIdentifier: "op", email: "op@test.sage" });
      const organizationId = await operator.mutation(api.organizations.create, { name: "SAGE" });
      const eventId = await operator.mutation(api.events.create, { organizationId, name: "Summit" });
      const sourceId = await operator.mutation(api.sources.create, { eventId, name: "Client doc", provider: "google_docs", url: DOC_URL });

      // Source creation schedules the first sync; extraction follows it.
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const sources = await operator.query(api.sources.list, { eventId });
      expect(sources[0]).toMatchObject({ state: "connected", lastRevision: "drive:4:r2" });
      expect(sources[0].lastSyncAt).toBeTypeOf("number");
      const snapshot = await operator.query(api.snapshots.latest, { sourceId });
      expect(snapshot?.content).toContain("Keynote");
      // Zero-click compile: extraction output lands in the master immediately,
      // with the proposals kept as the auto-compiler's audit trail.
      const proposalsBefore = await operator.query(api.master.listProposals, { eventId });
      expect(proposalsBefore.length).toBe(6);
      expect(proposalsBefore.every(p => p.state === "approved" && p.decidedBy === "auto-compiler")).toBe(true);
      const compiled = await operator.query(api.master.latest, { eventId });
      expect(compiled?.fields.some(f => f.value === "Keynote")).toBe(true);

      // Unchanged revision: poll is a cheap metadata check, no new snapshot or proposals.
      await t.action(internal.sync.pollAllSources, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect((await operator.query(api.snapshots.list, { sourceId })).length).toBe(1);

      // A content edit under a new revision captures a snapshot and recompiles only the changes.
      state.version = 5;
      state.docText = "2026-11-03 09:00 Opening\n2026-11-03 10:00 Keynote with Ava";
      await t.action(internal.sync.pollAllSources, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect((await operator.query(api.snapshots.list, { sourceId })).length).toBe(2);
      const proposalsAfter = await operator.query(api.master.listProposals, { eventId });
      // Rebuild-from-current semantics: the new snapshot re-records every
      // claim (so nothing silently drops out), and the master mirrors the
      // document's current state — the retitle lands, nothing duplicates.
      expect(proposalsAfter.length).toBe(proposalsBefore.length + 6);
      expect(proposalsAfter.filter(p => p.proposedValue === "Opening").length).toBeGreaterThanOrEqual(1);
      const recompiled = await operator.query(api.master.latest, { eventId });
      expect(recompiled?.fields.some(f => f.value === "Keynote with Ava")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks sources that lose access and recovers nothing silently", async () => {
    vi.useFakeTimers();
    try {
      const state = { docText: "2026-11-03 09:00 Opening", version: 1, failWith: undefined as number | undefined };
      vi.stubGlobal("fetch", googleFetchMock(state));
      const t = convexTest(schema, modules);
      await seedConnection(t);
      const operator = t.withIdentity({ subject: "op", issuer: "https://clerk.test", tokenIdentifier: "op", email: "op@test.sage" });
      const organizationId = await operator.mutation(api.organizations.create, { name: "SAGE" });
      const eventId = await operator.mutation(api.events.create, { organizationId, name: "Summit" });
      const sourceId = await operator.mutation(api.sources.create, { eventId, name: "Client doc", provider: "google_docs", url: DOC_URL });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      state.failWith = 403;
      await t.action(internal.sync.pollAllSources, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const source = (await operator.query(api.sources.list, { eventId }))[0];
      expect(source.state).toBe("access_removed");
      expect(source.lastError).toBe("access_removed");
      // The last good snapshot stays available.
      expect((await operator.query(api.snapshots.latest, { sourceId }))?.content).toContain("Opening");
    } finally {
      vi.useRealTimers();
    }
  });

  it("requires a connection before manual refresh and enforces operator access", async () => {
    const t = convexTest(schema, modules);
    const operator = t.withIdentity({ subject: "op", issuer: "https://clerk.test", tokenIdentifier: "op", email: "op@test.sage" });
    const outsider = t.withIdentity({ subject: "x", issuer: "https://clerk.test", tokenIdentifier: "x", email: "x@test.sage" });
    const organizationId = await operator.mutation(api.organizations.create, { name: "SAGE" });
    const eventId = await operator.mutation(api.events.create, { organizationId, name: "Summit" });
    const sourceId = await operator.mutation(api.sources.create, { eventId, name: "Doc", provider: "google_docs", url: DOC_URL });
    await expect(outsider.action(api.sync.refreshSource, { sourceId })).rejects.toThrow("Access denied");
    await expect(operator.action(api.sync.refreshSource, { sourceId })).rejects.toThrow("Connect the studio Google account");
  });
});
