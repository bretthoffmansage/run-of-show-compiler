import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { signedInUser } from "./access";
import { openSecret, sealSecret } from "../lib/google-crypto";
import { AirtableReadError, whoAmI } from "../lib/airtable-reader";

/**
 * One Airtable Personal Access Token for the studio, pasted once in
 * Settings. It is sealed (AES-256-GCM) server-side with the same key as the
 * Google connection and never returned to the browser.
 */
function cipherKey(): string {
  const key = process.env.GOOGLE_TOKEN_CIPHER_KEY;
  if (!key) throw new Error("Token storage is not configured (missing GOOGLE_TOKEN_CIPHER_KEY)");
  return key;
}

export const status = query({
  args: {},
  handler: async (ctx) => {
    await signedInUser(ctx);
    const row = await ctx.db.query("airtableConnections").first();
    if (!row) return { connected: false as const };
    return { connected: true as const, accountEmail: row.accountEmail ?? null, scopes: row.scopes, connectedAt: row.connectedAt, lastError: row.lastError ?? null };
  },
});

export const activeConnection = internalQuery({
  args: {},
  handler: async (ctx) => ctx.db.query("airtableConnections").first(),
});

export const storeConnection = internalMutation({
  args: { accountEmail: v.optional(v.string()), encryptedToken: v.string(), scopes: v.string(), connectedBy: v.string() },
  handler: async (ctx, args) => {
    for (const row of await ctx.db.query("airtableConnections").collect()) await ctx.db.delete(row._id);
    await ctx.db.insert("airtableConnections", { ...args, connectedAt: Date.now() });
  },
});

export const noteResult = internalMutation({
  args: { error: v.optional(v.string()) },
  handler: async (ctx, { error }) => {
    const row = await ctx.db.query("airtableConnections").first();
    if (row) await ctx.db.patch(row._id, { lastError: error });
  },
});

/** Validates the token against Airtable before storing it. */
export const connect = action({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<{ accountEmail: string | null }> => {
    const user = await signedInUser(ctx);
    const clean = token.trim();
    if (!/^pat[A-Za-z0-9._-]{20,}$/.test(clean)) throw new Error("That doesn't look like an Airtable personal access token (they start with \"pat\")");
    let who;
    try {
      who = await whoAmI(clean, fetch);
    } catch (error) {
      if (error instanceof AirtableReadError && error.code === "needs_token") throw new Error("Airtable rejected that token; check it was copied in full");
      throw new Error("Couldn't reach Airtable to check the token; try again shortly");
    }
    if (who.scopes.length && !who.scopes.includes("data.records:read")) throw new Error("The token needs the data.records:read scope (and schema.bases:read)");
    await ctx.runMutation(internal.airtable.storeConnection, {
      accountEmail: who.email ?? undefined,
      encryptedToken: await sealSecret(clean, cipherKey()),
      scopes: who.scopes.join(" "),
      connectedBy: user.userId,
    });
    return { accountEmail: who.email };
  },
});

export const disconnect = mutation({
  args: {},
  handler: async (ctx) => {
    await signedInUser(ctx);
    for (const row of await ctx.db.query("airtableConnections").collect()) await ctx.db.delete(row._id);
  },
});

/** For sync actions only. */
export async function openAirtableToken(row: { encryptedToken: string }): Promise<string> {
  return openSecret(row.encryptedToken, cipherKey());
}
