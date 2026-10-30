import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { eventAccess } from "./access";
import { mintAccessToken } from "./google";
import { openAirtableToken } from "./airtable";
import { AirtableReadError, readAirtableSource } from "../lib/airtable-reader";
import { GoogleReadError, readGoogleMetadata, readGoogleSource } from "../lib/google-reader";
import { sourceState } from "./schema";
import type { Doc } from "./_generated/dataModel";

export const listPollable = internalQuery({
  args: {},
  handler: async (ctx) => {
    const sources = await ctx.db.query("sources").collect();
    return sources.filter(source => !source.archived && source.provider !== "manual" && source.state !== "paused");
  },
});

export const getSource = internalQuery({
  args: { sourceId: v.id("sources") },
  handler: (ctx, { sourceId }) => ctx.db.get(sourceId),
});

/** Operator-authorized lookup for the manual refresh action. */
export const sourceForOperator = internalQuery({
  args: { sourceId: v.id("sources") },
  handler: async (ctx, { sourceId }) => {
    const source = await ctx.db.get(sourceId);
    if (!source || source.archived) throw new Error("Access denied");
    await eventAccess(ctx, source.eventId, "edit");
    return source;
  },
});

export const markChecked = internalMutation({
  args: { sourceId: v.id("sources") },
  handler: async (ctx, { sourceId }) => {
    const source = await ctx.db.get(sourceId);
    if (!source || source.archived || source.state === "paused") return;
    await ctx.db.patch(sourceId, { lastCheckedAt: Date.now(), state: "connected", lastError: undefined });
  },
});

export const markSynced = internalMutation({
  args: { sourceId: v.id("sources"), revision: v.string() },
  handler: async (ctx, { sourceId, revision }) => {
    const source = await ctx.db.get(sourceId);
    if (!source || source.archived) return;
    const now = Date.now();
    await ctx.db.patch(sourceId, { lastCheckedAt: now, lastSyncAt: now, lastRevision: revision, state: source.state === "paused" ? "paused" : "connected", lastError: undefined });
  },
});

export const markSourceError = internalMutation({
  args: { sourceId: v.id("sources"), state: v.optional(sourceState), error: v.string() },
  handler: async (ctx, { sourceId, state, error }) => {
    const source = await ctx.db.get(sourceId);
    if (!source || source.archived) return;
    await ctx.db.patch(sourceId, { lastCheckedAt: Date.now(), lastError: error.slice(0, 500), ...(state && source.state !== "paused" ? { state } : {}) });
  },
});

const ERROR_STATE: Record<GoogleReadError["code"], Doc<"sources">["state"] | undefined> = {
  needs_reauthorization: "needs_reauthorization",
  access_removed: "access_removed",
  invalid_source: "error",
  parse_failed: "error",
  too_large: "error",
  office_file: "error",
  api_disabled: "error",
  scope_insufficient: "error",
  // Transient conditions keep the current state; only the error note updates.
  rate_limited: undefined,
  unavailable: undefined,
};

/** A drive.google.com link (or a wrongly guessed kind) resolves on first metadata read. */
export const correctProvider = internalMutation({
  args: { sourceId: v.id("sources"), provider: v.union(v.literal("google_docs"), v.literal("google_sheets")) },
  handler: async (ctx, { sourceId, provider }) => {
    const source = await ctx.db.get(sourceId);
    if (!source || source.archived || source.provider === "manual" || source.provider === provider) return;
    await ctx.db.patch(sourceId, { provider });
  },
});

const AIRTABLE_ERROR_STATE: Record<AirtableReadError["code"], Doc<"sources">["state"] | undefined> = {
  needs_token: "needs_reauthorization",
  no_access: "access_removed",
  invalid_source: "error",
  parse_failed: "error",
  too_large: "error",
  rate_limited: undefined,
  unavailable: undefined,
};

/**
 * Airtable has no change probe: every poll reads the records, and the
 * revision is a hash of the rendered data, so an unchanged table captures
 * nothing new and any client edit does.
 */
async function syncAirtable(ctx: ActionCtx, source: Doc<"sources">): Promise<void> {
  const row: Doc<"airtableConnections"> | null = await ctx.runQuery(internal.airtable.activeConnection, {});
  if (!row) {
    await ctx.runMutation(internal.sync.markSourceError, { sourceId: source._id, state: "not_connected", error: "no_airtable_connection" });
    return;
  }
  try {
    const read = await readAirtableSource({ url: source.url, token: await openAirtableToken(row), fetcher: fetch });
    if (read.revision === source.lastRevision) {
      await ctx.runMutation(internal.sync.markChecked, { sourceId: source._id });
      return;
    }
    const captured = await ctx.runMutation(internal.snapshots.capture, { sourceId: source._id, revision: read.revision, content: read.text });
    await ctx.runMutation(internal.sync.markSynced, { sourceId: source._id, revision: read.revision });
    if (captured.changed) await ctx.scheduler.runAfter(0, internal.extraction.runSnapshot, { snapshotId: captured.snapshotId });
    await ctx.runMutation(internal.airtable.noteResult, {});
  } catch (error) {
    const code = error instanceof AirtableReadError ? error.code : "sync_failed";
    await ctx.runMutation(internal.sync.markSourceError, { sourceId: source._id, state: error instanceof AirtableReadError ? AIRTABLE_ERROR_STATE[error.code] : "error", error: `airtable_${code}` });
    if (code === "needs_token") await ctx.runMutation(internal.airtable.noteResult, { error: "Airtable rejected the token" });
  }
}

async function syncSource(ctx: ActionCtx, source: Doc<"sources">, accessToken: string, force = false): Promise<void> {
  if (source.provider === "manual") return;
  if (source.provider === "airtable") return syncAirtable(ctx, source);
  try {
    if (!force && source.lastRevision) {
      const meta = await readGoogleMetadata({ url: source.url, accessToken, fetcher: fetch });
      if (meta.provider !== source.provider) await ctx.runMutation(internal.sync.correctProvider, { sourceId: source._id, provider: meta.provider });
      if (meta.revision === source.lastRevision) {
        await ctx.runMutation(internal.sync.markChecked, { sourceId: source._id });
        return;
      }
    }
    const full = await readGoogleSource({ url: source.url, accessToken, fetcher: fetch });
    if (full.provider !== source.provider) await ctx.runMutation(internal.sync.correctProvider, { sourceId: source._id, provider: full.provider });
    const captured = await ctx.runMutation(internal.snapshots.capture, { sourceId: source._id, revision: full.revision, content: full.text });
    await ctx.runMutation(internal.sync.markSynced, { sourceId: source._id, revision: full.revision });
    if (captured.changed) await ctx.scheduler.runAfter(0, internal.extraction.runSnapshot, { snapshotId: captured.snapshotId });
  } catch (error) {
    if (error instanceof GoogleReadError) {
      await ctx.runMutation(internal.sync.markSourceError, { sourceId: source._id, state: ERROR_STATE[error.code], error: error.code });
    } else {
      await ctx.runMutation(internal.sync.markSourceError, { sourceId: source._id, state: "error", error: "sync_failed" });
    }
  }
}

type TokenResult = { ok: true; accessToken: string; scopes: string; connectionId: Doc<"googleConnections">["_id"] } | { ok: false; reauth: boolean };

/** Shared by the sync pipeline and the playbook writer. */
export async function connectionToken(ctx: ActionCtx): Promise<TokenResult | null> {
  const connection = await ctx.runQuery(internal.google.activeConnection, {});
  if (!connection) return null;
  const minted = await mintAccessToken(connection);
  await ctx.runMutation(internal.google.noteConnectionResult, { connectionId: connection._id, error: minted.ok ? undefined : minted.message });
  if (!minted.ok) return { ok: false, reauth: minted.code === "invalid_grant" };
  return { ok: true, accessToken: minted.accessToken, scopes: connection.scopes, connectionId: connection._id };
}

/** Cron entry point: reconcile every live source against Google. */
export const pollAllSources = internalAction({
  args: {},
  handler: async (ctx) => {
    const all: Doc<"sources">[] = await ctx.runQuery(internal.sync.listPollable, {});
    for (const source of all.filter(s => s.provider === "airtable")) await syncAirtable(ctx, source);
    const sources = all.filter(s => s.provider !== "airtable");
    if (!sources.length) return;
    const token = await connectionToken(ctx);
    if (!token) return;
    if (!token.ok) {
      if (token.reauth) {
        for (const source of sources) {
          await ctx.runMutation(internal.sync.markSourceError, { sourceId: source._id, state: "needs_reauthorization", error: "connection_needs_reauthorization" });
        }
      }
      return;
    }
    for (const source of sources) await syncSource(ctx, source, token.accessToken);
  },
});

/** First sync for a just-created source, scheduled by sources.create. */
export const pollOne = internalAction({
  args: { sourceId: v.id("sources") },
  handler: async (ctx, { sourceId }): Promise<void> => {
    const source: Doc<"sources"> | null = await ctx.runQuery(internal.sync.getSource, { sourceId });
    if (!source || source.archived || source.provider === "manual" || source.state === "paused") return;
    if (source.provider === "airtable") return syncAirtable(ctx, source);
    const token = await connectionToken(ctx);
    if (!token) {
      await ctx.runMutation(internal.sync.markSourceError, { sourceId, state: "not_connected", error: "no_google_connection" });
      return;
    }
    if (!token.ok) {
      await ctx.runMutation(internal.sync.markSourceError, { sourceId, state: "needs_reauthorization", error: "connection_needs_reauthorization" });
      return;
    }
    await syncSource(ctx, source, token.accessToken);
  },
});

/** Operator-triggered re-pull that bypasses the unchanged-revision short-circuit. */
export const refreshSource = action({
  args: { sourceId: v.id("sources") },
  handler: async (ctx, { sourceId }): Promise<void> => {
    const source: Doc<"sources"> = await ctx.runQuery(internal.sync.sourceForOperator, { sourceId });
    if (source.provider === "manual") throw new Error("Manual sources have no live connection");
    if (source.state === "paused") throw new Error("Resume the source before refreshing");
    if (source.provider === "airtable") return syncAirtable(ctx, source);
    const token = await connectionToken(ctx);
    if (!token) throw new Error("Connect the studio Google account in Settings first");
    if (!token.ok) throw new Error(token.reauth ? "Google connection needs reauthorization; reconnect it in Settings" : "Google is unreachable; try again shortly");
    await syncSource(ctx, source, token.accessToken, true);
  },
});
