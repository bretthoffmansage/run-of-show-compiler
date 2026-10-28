/** Server-use read adapter. Caller must supply a verified, server-held OAuth token. */
export type GoogleProvider = "google_docs" | "google_sheets";
export type GoogleReadErrorCode = "invalid_source" | "needs_reauthorization" | "access_removed" | "rate_limited" | "unavailable" | "parse_failed" | "too_large";

export class GoogleReadError extends Error {
  constructor(readonly code: GoogleReadErrorCode) {
    super(code);
    this.name = "GoogleReadError";
  }
}

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_TEXT_BYTES = 64 * 1024;

function fileIdFromUrl(input: string, provider: GoogleProvider): string {
  let url: URL;
  try { url = new URL(input); } catch { throw new GoogleReadError("invalid_source"); }
  const prefix = provider === "google_docs" ? "/document/d/" : "/spreadsheets/d/";
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com" || !url.pathname.startsWith(prefix)) throw new GoogleReadError("invalid_source");
  const id = url.pathname.slice(prefix.length).split("/")[0];
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new GoogleReadError("invalid_source");
  return id;
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
    if (response.status === 403 || response.status === 404) throw new GoogleReadError("access_removed");
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

/** Cheap change probe: Drive metadata only, no document content. */
export async function readGoogleMetadata(args: { url: string; provider: GoogleProvider; accessToken: string; fetcher: Fetcher }) {
  const { url, provider, accessToken, fetcher } = args;
  const fileId = fileIdFromUrl(url, provider);
  if (!accessToken) throw new GoogleReadError("needs_reauthorization");
  const meta = await jsonFromGoogle(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,mimeType,version,modifiedTime,trashed`, accessToken, fetcher);
  const expectedMime = provider === "google_docs" ? "application/vnd.google-apps.document" : "application/vnd.google-apps.spreadsheet";
  if (meta.id !== fileId || meta.mimeType !== expectedMime || meta.trashed === true) throw new GoogleReadError("access_removed");
  if (typeof meta.version !== "string" || !meta.version) throw new GoogleReadError("parse_failed");
  return { fileId, revision: `drive:${meta.version}`, modifiedTime: typeof meta.modifiedTime === "string" ? meta.modifiedTime : null };
}

export async function readGoogleSource(args: { url: string; provider: GoogleProvider; accessToken: string; fetcher: Fetcher }) {
  const { provider, accessToken, fetcher } = args;
  const meta = await readGoogleMetadata(args);
  const fileId = meta.fileId;

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
      return [`# ${titles[index] ?? "Sheet"}`, ...(values ?? []).map(row => Array.isArray(row) ? row.map(String).join("\t") : "")].join("\n");
    }).join("\n\n");
  }
  if (new TextEncoder().encode(text).length > MAX_TEXT_BYTES) throw new GoogleReadError("too_large");
  return { fileId, provider, revision: meta.revision, modifiedTime: meta.modifiedTime, text, raw };
}
