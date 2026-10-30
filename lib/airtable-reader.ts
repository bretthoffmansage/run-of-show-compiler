/**
 * Live Airtable reader. Reads a base's table (in a view's order when the
 * link names a view) through the Airtable Web API with a Personal Access
 * Token, and renders it in the same dump format as spreadsheets so the
 * deterministic sheet reader handles it cell by cell:
 *
 *   # <day>            one section per value of the table's Day/Date field
 *   ## <field>\t...    the declared header row (field names, in table order)
 *   value\tvalue\t...  one line per record, every cell as displayed
 *
 * Airtable has no cheap change probe, so every poll reads the records and
 * the revision is a hash of the rendered text: unchanged data captures no
 * new snapshot, any client edit does.
 */
import { CELL_NEWLINE } from "./google-reader";

export type AirtableErrorCode = "invalid_source" | "needs_token" | "no_access" | "rate_limited" | "unavailable" | "parse_failed" | "too_large";

export class AirtableReadError extends Error {
  constructor(readonly code: AirtableErrorCode) {
    super(code);
    this.name = "AirtableReadError";
  }
}

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export interface ParsedAirtableUrl { baseId: string; tableId: string; viewId: string | null; canonicalUrl: string }

const API = "https://api.airtable.com/v0";
const MAX_PAGES = 60;           // 6,000 records
const MAX_TEXT_BYTES = 256 * 1024;

/** airtable.com/appXXX/tblYYY[/viwZZZ][...] — base and table are required. */
export function parseAirtableUrl(input: string): ParsedAirtableUrl | null {
  let url: URL;
  try { url = new URL(input.trim()); } catch { return null; }
  if (url.protocol !== "https:" || (url.hostname !== "airtable.com" && url.hostname !== "www.airtable.com")) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  const baseId = segments.find(s => /^app[A-Za-z0-9]{14}$/.test(s));
  const tableId = segments.find(s => /^tbl[A-Za-z0-9]{14}$/.test(s));
  const viewId = segments.find(s => /^viw[A-Za-z0-9]{14}$/.test(s)) ?? null;
  if (!baseId || !tableId) return null;
  return { baseId, tableId, viewId, canonicalUrl: `https://airtable.com/${baseId}/${tableId}${viewId ? `/${viewId}` : ""}` };
}

async function airtableJson(url: string, token: string, fetcher: Fetcher): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetcher(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new AirtableReadError("unavailable");
  }
  if (!response.ok) {
    if (response.status === 401) throw new AirtableReadError("needs_token");
    if (response.status === 403 || response.status === 404) throw new AirtableReadError("no_access");
    if (response.status === 429) throw new AirtableReadError("rate_limited");
    throw new AirtableReadError("unavailable");
  }
  try {
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("not an object");
    return data as Record<string, unknown>;
  } catch { throw new AirtableReadError("parse_failed"); }
}

const cellText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : Array.isArray(value) ? value.map(cellText).join(", ") : String(value);
  return text.replace(/\r?\n/g, CELL_NEWLINE).replace(/\t/g, " ").trim();
};

/** The field that names each record's day, if the table has one. */
export function dayFieldOf(fields: string[]): string | null {
  return fields.find(name => /^(day|date|event day|show day)$/i.test(name.trim()))
    ?? fields.find(name => /\bday\b/i.test(name))
    ?? null;
}

export async function hashText(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].slice(0, 12).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function readAirtableSource(args: { url: string; token: string; fetcher: Fetcher }) {
  const parsed = parseAirtableUrl(args.url);
  if (!parsed) throw new AirtableReadError("invalid_source");
  if (!args.token) throw new AirtableReadError("needs_token");
  const { baseId, tableId, viewId } = parsed;

  // Table name and field order from the schema (needs schema.bases:read);
  // without it, field order falls back to first appearance in the records.
  let tableName = "Airtable";
  let fieldOrder: string[] = [];
  try {
    const meta = await airtableJson(`${API}/meta/bases/${baseId}/tables`, args.token, args.fetcher);
    const table = (meta.tables as Array<{ id: string; name: string; fields: Array<{ name: string }>; views?: Array<{ id: string; name: string }> }> | undefined)?.find(t => t.id === tableId);
    if (table) {
      tableName = table.name;
      fieldOrder = table.fields.map(f => f.name);
      const view = viewId ? table.views?.find(v => v.id === viewId) : undefined;
      if (view) tableName = `${table.name} — ${view.name}`;
    }
  } catch (error) {
    if (error instanceof AirtableReadError && (error.code === "needs_token" || error.code === "unavailable" || error.code === "rate_limited")) throw error;
  }

  const records: Array<Record<string, unknown>> = [];
  let offset: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({ pageSize: "100", cellFormat: "string", timeZone: "America/New_York", userLocale: "en-us" });
    if (viewId) params.set("view", viewId);
    if (offset) params.set("offset", offset);
    const data = await airtableJson(`${API}/${baseId}/${tableId}?${params}`, args.token, args.fetcher);
    const batch = data.records;
    if (!Array.isArray(batch)) throw new AirtableReadError("parse_failed");
    for (const record of batch) records.push(((record as { fields?: Record<string, unknown> }).fields) ?? {});
    offset = typeof data.offset === "string" ? data.offset : undefined;
    if (!offset) break;
    if (page === MAX_PAGES - 1) throw new AirtableReadError("too_large");
  }

  for (const record of records) for (const name of Object.keys(record)) if (!fieldOrder.includes(name)) fieldOrder.push(name);
  const dayField = dayFieldOf(fieldOrder);
  const columns = fieldOrder.filter(name => name !== dayField && records.some(r => cellText(r[name])));
  const header = `## ${columns.join("\t")}`;
  const sections = new Map<string, string[]>();
  for (const record of records) {
    const cells = columns.map(name => cellText(record[name]));
    if (!cells.some(Boolean)) continue;
    const day = dayField ? cellText(record[dayField]) || "No day listed" : tableName;
    sections.set(day, [...(sections.get(day) ?? []), cells.join("\t")]);
  }
  const text = [...sections].map(([day, rows]) => [`# ${day}`, header, ...rows].join("\n")).join("\n\n");
  if (new TextEncoder().encode(text).length > MAX_TEXT_BYTES) throw new AirtableReadError("too_large");
  return { revision: `airtable:${await hashText(text)}`, text, recordCount: records.length };
}

/** Validates a Personal Access Token and reports which account owns it. */
export async function whoAmI(token: string, fetcher: Fetcher): Promise<{ id: string; email: string | null; scopes: string[] }> {
  const data = await airtableJson(`${API}/meta/whoami`, token, fetcher);
  return {
    id: String(data.id ?? ""),
    email: typeof data.email === "string" ? data.email : null,
    scopes: Array.isArray(data.scopes) ? data.scopes.map(String) : [],
  };
}
