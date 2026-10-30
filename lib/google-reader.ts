/** Server-use read adapter. Caller must supply a verified, server-held OAuth token. */
import { parseGoogleSourceUrl, type DetectedProvider } from "./google-url";

export type GoogleProvider = "google_docs" | "google_sheets";
export type GoogleReadErrorCode = "invalid_source" | "needs_reauthorization" | "access_removed" | "rate_limited" | "unavailable" | "parse_failed" | "too_large" | "office_file" | "api_disabled" | "scope_insufficient";

export class GoogleReadError extends Error {
  constructor(readonly code: GoogleReadErrorCode) {
    super(code);
    this.name = "GoogleReadError";
  }
}

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
/**
 * A line break INSIDE a spreadsheet cell is stored as U+2028 so every
 * physical line of the dump is exactly one sheet row (a two-line cell must
 * not split its row in two). Writers turn it back into a line break.
 */
export const CELL_NEWLINE = "\u2028";
/** Bump when the stored text format changes: forces a fresh read of every source. */
const READER_FORMAT = "r2";
const MAX_TEXT_BYTES = 256 * 1024;

const NATIVE_MIME: Record<string, GoogleProvider> = {
  "application/vnd.google-apps.document": "google_docs",
  "application/vnd.google-apps.spreadsheet": "google_sheets",
};
/** Office/CSV files stored in Drive open in Docs/Sheets but are not readable through these APIs. */
const OFFICE_MIME = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/msword",
  "text/csv",
]);

function fileIdFromUrl(input: string): string {
  const parsed = parseGoogleSourceUrl(input);
  if (!parsed) throw new GoogleReadError("invalid_source");
  return parsed.fileId;
}

/**
 * A Google 403 means three very different things. Telling them apart is the
 * difference between "share the file" (wrong advice two times out of three)
 * and the fix that actually works, so read the error body:
 * - the Drive API is disabled in the app's own Cloud project, or
 * - the stored grant is missing the Drive scope (a consent box was unchecked), or
 * - the connected account really cannot see this file.
 */
async function classify403(response: Response): Promise<GoogleReadErrorCode> {
  let body = "";
  try { body = (await response.text()).slice(0, 4000); } catch { return "access_removed"; }
  if (/accessNotConfigured|SERVICE_DISABLED|has not been used in project/i.test(body)) return "api_disabled";
  if (/insufficient[\s\S]*scope|ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficientPermissions/i.test(body)) return "scope_insufficient";
  return "access_removed";
}

async function jsonFromGoogle(url: string, token: string, fetcher: Fetcher): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetcher(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new GoogleReadError("unavailable");
  }
  if (!response.ok) {
    if (response.status === 401) throw new GoogleReadError("needs_reauthorization");
    if (response.status === 403) throw new GoogleReadError(await classify403(response));
    if (response.status === 404) throw new GoogleReadError("access_removed");
    if (response.status === 429) throw new GoogleReadError("rate_limited");
    throw new GoogleReadError("unavailable");
  }
  if (Number(response.headers.get("content-length") ?? 0) > MAX_RESPONSE_BYTES) throw new GoogleReadError("too_large");
  if (!response.body) throw new GoogleReadError("parse_failed");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RESPONSE_BYTES) throw new GoogleReadError("too_large");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const data: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Not an object");
    return data as Record<string, unknown>;
  } catch { throw new GoogleReadError("parse_failed"); }
}

function textFromDoc(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const node = value as Record<string, unknown>;
  let text = typeof (node.textRun as Record<string, unknown> | undefined)?.content === "string" ? String((node.textRun as Record<string, unknown>).content) : "";
  for (const key of ["body", "content", "paragraph", "elements", "table", "tableRows", "tableCells", "tableOfContents", "tabs", "documentTab", "childTabs"]) {
    const child = node[key];
    if (Array.isArray(child)) text += child.map(textFromDoc).join("");
    else if (child && typeof child === "object") text += textFromDoc(child);
  }
  return text;
}

function sheetTitles(data: Record<string, unknown>): string[] {
  if (!Array.isArray(data.sheets)) throw new GoogleReadError("parse_failed");
  const titles = data.sheets.map(sheet => (sheet as { properties?: { title?: unknown } })?.properties?.title);
  if (!titles.length || titles.some(title => typeof title !== "string" || !title)) throw new GoogleReadError("parse_failed");
  return titles as string[];
}

/**
 * Cheap change probe: Drive metadata only, no document content. Also detects
 * what the file really is, so a pasted drive.google.com link (or a source
 * added with the wrong kind) resolves itself; Office files stored in Drive
 * get a distinct, actionable error instead of looking like lost access.
 */
export async function readGoogleMetadata(args: { url: string; accessToken: string; fetcher: Fetcher }) {
  const { url, accessToken, fetcher } = args;
  const fileId = fileIdFromUrl(url);
  if (!accessToken) throw new GoogleReadError("needs_reauthorization");
  // supportsAllDrives: without it the Drive API answers 404 for any file on
  // a shared drive, which reads as "no access" even for the account's own files.
  const meta = await jsonFromGoogle(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,mimeType,version,modifiedTime,trashed&supportsAllDrives=true`, accessToken, fetcher);
  if (meta.id !== fileId || meta.trashed === true) throw new GoogleReadError("access_removed");
  const mime = typeof meta.mimeType === "string" ? meta.mimeType : "";
  const provider: DetectedProvider | undefined = NATIVE_MIME[mime];
  if (!provider) throw new GoogleReadError(OFFICE_MIME.has(mime) ? "office_file" : "invalid_source");
  if (typeof meta.version !== "string" || !meta.version) throw new GoogleReadError("parse_failed");
  return { fileId, provider, revision: `drive:${meta.version}:${READER_FORMAT}`, modifiedTime: typeof meta.modifiedTime === "string" ? meta.modifiedTime : null };
}

export async function readGoogleSource(args: { url: string; accessToken: string; fetcher: Fetcher }) {
  const { accessToken, fetcher } = args;
  const meta = await readGoogleMetadata(args);
  const { fileId, provider } = meta;

  let raw: Record<string, unknown>;
  let text: string;
  if (provider === "google_docs") {
    raw = await jsonFromGoogle(`https://docs.googleapis.com/v1/documents/${fileId}?includeTabsContent=true`, accessToken, fetcher);
    text = textFromDoc(raw);
  } else {
    const structure = await jsonFromGoogle(`https://sheets.googleapis.com/v4/spreadsheets/${fileId}?fields=sheets(properties(title))`, accessToken, fetcher);
    const titles = sheetTitles(structure);
    const params = new URLSearchParams();
    for (const title of titles) params.append("ranges", `'${title.replaceAll("'", "''")}'`);
    raw = await jsonFromGoogle(`https://sheets.googleapis.com/v4/spreadsheets/${fileId}/values:batchGet?${params}`, accessToken, fetcher);
    if (!Array.isArray(raw.valueRanges)) throw new GoogleReadError("parse_failed");
    text = raw.valueRanges.map((range, index) => {
      const values = (range as { values?: unknown }).values;
      if (values !== undefined && !Array.isArray(values)) throw new GoogleReadError("parse_failed");
      return [`# ${titles[index] ?? "Sheet"}`, ...(values ?? []).map(row => Array.isArray(row) ? row.map(cell => String(cell).replace(/\r?\n/g, CELL_NEWLINE)).join("\t") : "")].join("\n");
    }).join("\n\n");
  }
  if (new TextEncoder().encode(text).length > MAX_TEXT_BYTES) throw new GoogleReadError("too_large");
  return { fileId, provider, revision: meta.revision, modifiedTime: meta.modifiedTime, text, raw };
}
