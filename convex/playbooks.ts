import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { eventAccess } from "./access";
import { connectionToken } from "./sync";
import { isPagTitle, pagPlan, pagWriteRequests, renameCopiedTabRequests } from "../lib/playbook-writer";

/**
 * The real deliverable: a Google Sheet playbook in the studio account's
 * Drive, created from the SAGE "Playbook Empty" template on the first
 * compile and rewritten after every compile — zero clicks. Conflicts render
 * as red text and fresh changes as pink text inside the sheet, matching the
 * site and the SAGE convention.
 */

const DEFAULT_TEMPLATE_ID = "1-ccUVXjoJXwTyZT4JQlMHrlHgS5aAgdsPWFSL9kQYMM";

function templateId(): string {
  return process.env.PLAYBOOK_TEMPLATE_ID?.trim() || DEFAULT_TEMPLATE_ID;
}

export const forEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    await eventAccess(ctx, eventId, "read");
    const playbook = await ctx.db.query("playbooks").withIndex("by_event", q => q.eq("eventId", eventId)).first();
    if (!playbook) return null;
    return { url: playbook.url, lastWriteAt: playbook.lastWriteAt ?? null, lastError: playbook.lastError ?? null };
  },
});

export const compileContext = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    if (!event || event.archived) return null;
    const playbook = await ctx.db.query("playbooks").withIndex("by_event", q => q.eq("eventId", eventId)).first();
    const revision = await ctx.db.query("masterRevisions").withIndex("by_event", q => q.eq("eventId", eventId)).order("desc").first();
    return { eventName: event.name, playbook, fields: revision?.fields ?? [], revisionNumber: revision?.number ?? 0 };
  },
});

/** Every compiled event whose playbook is missing, failed, or behind the master. */
export const listNeedingSync = internalQuery({
  args: {},
  handler: async (ctx) => {
    const events = (await ctx.db.query("events").collect()).filter(event => !event.archived);
    const needing: Array<typeof events[number]["_id"]> = [];
    for (const event of events) {
      const revision = await ctx.db.query("masterRevisions").withIndex("by_event", q => q.eq("eventId", event._id)).order("desc").first();
      if (!revision) continue;
      const playbook = await ctx.db.query("playbooks").withIndex("by_event", q => q.eq("eventId", event._id)).first();
      if (!playbook || !playbook.spreadsheetId || playbook.lastError || (playbook.lastRevisionNumber ?? -1) < revision.number) needing.push(event._id);
    }
    return needing;
  },
});

export const record = internalMutation({
  args: { eventId: v.id("events"), spreadsheetId: v.string(), url: v.string(), templateId: v.string(), pagSheetId: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("playbooks").withIndex("by_event", q => q.eq("eventId", args.eventId)).first();
    if (existing && existing.spreadsheetId) return existing._id;
    if (existing) {
      // A stub from an earlier failed attempt graduates into the real sheet.
      await ctx.db.patch(existing._id, { spreadsheetId: args.spreadsheetId, url: args.url, templateId: args.templateId, pagSheetId: args.pagSheetId });
      return existing._id;
    }
    return ctx.db.insert("playbooks", { ...args, createdAt: Date.now() });
  },
});

export const noteResult = internalMutation({
  args: { eventId: v.id("events"), error: v.optional(v.string()), revisionNumber: v.optional(v.number()) },
  handler: async (ctx, { eventId, error, revisionNumber }) => {
    const playbook = await ctx.db.query("playbooks").withIndex("by_event", q => q.eq("eventId", eventId)).first();
    if (!playbook) {
      // Keep failures visible even before a sheet exists: a stub row carries
      // the error to the event page instead of failing silently.
      if (error) await ctx.db.insert("playbooks", { eventId, spreadsheetId: "", url: "", templateId: templateId(), createdAt: Date.now(), lastError: error.slice(0, 500) });
      return;
    }
    await ctx.db.patch(playbook._id, error
      ? { lastError: error.slice(0, 500) }
      : { lastError: undefined, lastWriteAt: Date.now(), ...(revisionNumber !== undefined ? { lastRevisionNumber: revisionNumber } : {}) });
  },
});

async function sheetsJson(url: string, token: string, init?: { method?: string; body?: unknown }): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const body = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`Sheets API ${response.status}: ${body}`);
  }
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Sheets API returned a non-object");
  return data as Record<string, unknown>;
}

/** Cron entry point: catches events compiled before a playbook existed. */
export const syncAll = internalAction({
  args: {},
  handler: async (ctx) => {
    const eventIds = await ctx.runQuery(internal.playbooks.listNeedingSync, {});
    for (const eventId of eventIds) {
      await ctx.runAction(internal.playbooks.syncPlaybook, { eventId });
    }
  },
});

/** Scheduled after every compile and by the cron; safe to run repeatedly. */
export const syncPlaybook = internalAction({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const context = await ctx.runQuery(internal.playbooks.compileContext, { eventId });
    if (!context || !context.fields.length) return;
    const upToDate = context.playbook && context.playbook.spreadsheetId && !context.playbook.lastError && (context.playbook.lastRevisionNumber ?? -1) >= context.revisionNumber;
    if (upToDate) return;
    const token = await connectionToken(ctx);
    if (!token || !token.ok) {
      await ctx.runMutation(internal.playbooks.noteResult, { eventId, error: token && !token.ok ? "google_connection_failed" : "no_google_connection" });
      return;
    }
    if (!token.scopes.includes("spreadsheets")) {
      // Old read-only grant: the UI tells the operator to reconnect in Settings.
      await ctx.runMutation(internal.playbooks.noteResult, { eventId, error: "needs_reconnect_for_sheets" });
      return;
    }
    try {
      let playbook = context.playbook && context.playbook.spreadsheetId ? context.playbook : null;
      if (!playbook) {
        const created = await sheetsJson("https://sheets.googleapis.com/v4/spreadsheets", token.accessToken, {
          method: "POST",
          body: { properties: { title: `${context.eventName} — SAGE Playbook` } },
        });
        const spreadsheetId = String(created.spreadsheetId ?? "");
        if (!spreadsheetId) throw new Error("Spreadsheet creation returned no id");
        const defaultSheetId = (created.sheets as Array<{ properties?: { sheetId?: number } }> | undefined)?.[0]?.properties?.sheetId;

        // Copy every template tab into the new spreadsheet, then restore titles.
        const template = await sheetsJson(`https://sheets.googleapis.com/v4/spreadsheets/${templateId()}?fields=sheets(properties(sheetId,title))`, token.accessToken);
        const templateSheets = (template.sheets as Array<{ properties: { sheetId: number; title: string } }> | undefined) ?? [];
        if (!templateSheets.length) throw new Error("Playbook template has no tabs");
        const copies: Array<{ sheetId: number; title: string }> = [];
        for (const sheet of templateSheets) {
          const copy = await sheetsJson(`https://sheets.googleapis.com/v4/spreadsheets/${templateId()}/sheets/${sheet.properties.sheetId}:copyTo`, token.accessToken, {
            method: "POST",
            body: { destinationSpreadsheetId: spreadsheetId },
          });
          copies.push({ sheetId: Number(copy.sheetId), title: String(copy.title ?? `Copy of ${sheet.properties.title}`) });
        }
        const cleanup = [
          ...renameCopiedTabRequests(copies),
          ...(typeof defaultSheetId === "number" ? [{ deleteSheet: { sheetId: defaultSheetId } }] : []),
        ];
        await sheetsJson(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, token.accessToken, { method: "POST", body: { requests: cleanup } });

        const pag = copies.find(copy => isPagTitle(copy.title));
        const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
        await ctx.runMutation(internal.playbooks.record, { eventId, spreadsheetId, url, templateId: templateId(), pagSheetId: pag?.sheetId });
        playbook = { spreadsheetId, url, templateId: templateId(), pagSheetId: pag?.sheetId, eventId, createdAt: Date.now() } as NonNullable<typeof context.playbook>;
      }

      // Write the compiled grid into the PAG tab (first tab as a fallback).
      let pagSheetId = playbook.pagSheetId;
      if (pagSheetId === undefined) {
        const live = await sheetsJson(`https://sheets.googleapis.com/v4/spreadsheets/${playbook.spreadsheetId}?fields=sheets(properties(sheetId,title))`, token.accessToken);
        const sheets = (live.sheets as Array<{ properties: { sheetId: number; title: string } }> | undefined) ?? [];
        pagSheetId = (sheets.find(sheet => isPagTitle(sheet.properties.title)) ?? sheets[0])?.properties.sheetId;
        if (pagSheetId === undefined) throw new Error("Playbook has no tabs to write to");
      }
      const requests = pagWriteRequests(pagSheetId, pagPlan(context.fields, Date.now()));
      await sheetsJson(`https://sheets.googleapis.com/v4/spreadsheets/${playbook.spreadsheetId}:batchUpdate`, token.accessToken, { method: "POST", body: { requests } });
      await ctx.runMutation(internal.playbooks.noteResult, { eventId, revisionNumber: context.revisionNumber });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Playbook write failed";
      await ctx.runMutation(internal.playbooks.noteResult, { eventId, error: message });
    }
  },
});
