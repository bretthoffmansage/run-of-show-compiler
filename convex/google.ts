import { v } from "convex/values";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { signedInUser } from "./access";
import { openSecret, sealSecret } from "../lib/google-crypto";
import { exchangeAuthorizationCode, GoogleOAuthError, refreshAccessToken, revokeToken, validRedirectUri } from "../lib/google-oauth";

function cipherKey(): string {
  const key = process.env.GOOGLE_TOKEN_CIPHER_KEY;
  if (!key) throw new Error("Google connection is not configured (missing GOOGLE_TOKEN_CIPHER_KEY)");
  return key;
}

function oauthClient(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth is not configured (missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET)");
  return { clientId, clientSecret };
}

/** Connection status safe for the UI: never returns token material. */
export const status = query({
  args: {},
  handler: async (ctx) => {
    await signedInUser(ctx);
    const connection = await ctx.db.query("googleConnections").withIndex("by_status", q => q.eq("status", "active")).first();
    if (!connection) return { connected: false as const };
    return {
      connected: true as const,
      accountEmail: connection.accountEmail,
      connectedAt: connection.connectedAt,
      scopes: connection.scopes,
      lastRefreshAt: connection.lastRefreshAt ?? null,
      lastError: connection.lastError ?? null,
    };
  },
});

export const activeConnection = internalQuery({
  args: {},
  handler: async (ctx) => ctx.db.query("googleConnections").withIndex("by_status", q => q.eq("status", "active")).first(),
});

export const storeConnection = internalMutation({
  args: { accountEmail: v.string(), encryptedRefreshToken: v.string(), scopes: v.string(), connectedBy: v.string() },
  handler: async (ctx, args) => {
    // One studio connection at a time; replacing removes prior token material.
    for (const row of await ctx.db.query("googleConnections").collect()) await ctx.db.delete(row._id);
    await ctx.db.insert("googleConnections", { ...args, connectedAt: Date.now(), status: "active" });
  },
});

export const removeConnection = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const row of await ctx.db.query("googleConnections").collect()) await ctx.db.delete(row._id);
  },
});

export const noteConnectionResult = internalMutation({
  args: { connectionId: v.id("googleConnections"), error: v.optional(v.string()) },
  handler: async (ctx, { connectionId, error }) => {
    const row = await ctx.db.get(connectionId);
    if (!row) return;
    await ctx.db.patch(connectionId, error ? { lastError: error } : { lastError: undefined, lastRefreshAt: Date.now() });
  },
});

/**
 * Completes the one-time studio-account connect flow. The signed-in operator's
 * browser only carries the authorization code; the client secret, token
 * exchange, and sealed refresh token stay inside this deployment.
 */
export const completeOAuth = action({
  args: { code: v.string(), redirectUri: v.string() },
  handler: async (ctx, { code, redirectUri }): Promise<{ accountEmail: string }> => {
    const user = await signedInUser(ctx);
    if (!validRedirectUri(redirectUri)) throw new Error("Invalid redirect URI");
    const { clientId, clientSecret } = oauthClient();
    const exchanged = await exchangeAuthorizationCode({ code, redirectUri, clientId, clientSecret, fetcher: fetch });
    if (!exchanged.scopes.includes("drive.readonly")) throw new Error("Google grant is missing read-only Drive access; connect again and leave the Drive permission checked");
    if (!exchanged.accountEmail) throw new Error("Google did not identify the connected account");
    const expected = process.env.GOOGLE_EXPECTED_ACCOUNT?.trim().toLowerCase();
    if (expected && exchanged.accountEmail !== expected) {
      throw new Error(`Wrong Google account: connect ${expected}, not ${exchanged.accountEmail}`);
    }
    const sealed = await sealSecret(exchanged.refreshToken, cipherKey());
    await ctx.runMutation(internal.google.storeConnection, {
      accountEmail: exchanged.accountEmail,
      encryptedRefreshToken: sealed,
      scopes: exchanged.scopes,
      connectedBy: user.userId,
    });
    return { accountEmail: exchanged.accountEmail };
  },
});

export const disconnect = action({
  args: {},
  handler: async (ctx) => {
    await signedInUser(ctx);
    const connection = await ctx.runQuery(internal.google.activeConnection, {});
    if (connection) {
      try {
        const refreshToken = await openSecret(connection.encryptedRefreshToken, cipherKey());
        await revokeToken(refreshToken, fetch);
      } catch { /* Best effort; stored copy is removed below either way. */ }
    }
    await ctx.runMutation(internal.google.removeConnection, {});
  },
});

/** For sync actions only: mint a short-lived access token from the sealed refresh token. */
export async function mintAccessToken(connection: { _id: string; encryptedRefreshToken: string }): Promise<
  { ok: true; accessToken: string } | { ok: false; code: "invalid_grant" | "unavailable" | "exchange_failed"; message: string }
> {
  const { clientId, clientSecret } = oauthClient();
  const refreshToken = await openSecret(connection.encryptedRefreshToken, cipherKey());
  try {
    return { ok: true, accessToken: await refreshAccessToken({ refreshToken, clientId, clientSecret, fetcher: fetch }) };
  } catch (error) {
    if (error instanceof GoogleOAuthError) return { ok: false, code: error.code === "invalid_grant" ? "invalid_grant" : error.code, message: error.message };
    return { ok: false, code: "unavailable", message: "Token refresh failed" };
  }
}
