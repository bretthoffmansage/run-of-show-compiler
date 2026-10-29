/**
 * Accept the Google file links people actually paste and normalize them.
 * Covers docs.google.com Doc/Sheet URLs (including the signed-in /u/N/
 * variant) and drive.google.com file links, whose kind is unknown until the
 * Drive metadata probe reveals the real file type.
 */
export type DetectedProvider = "google_docs" | "google_sheets";

export interface ParsedGoogleUrl {
  fileId: string;
  /** null for drive.google.com links: the first sync detects the real kind. */
  provider: DetectedProvider | null;
  canonicalUrl: string;
}

const FILE_ID = /^[A-Za-z0-9_-]+$/;

export function parseGoogleSourceUrl(input: string): ParsedGoogleUrl | null {
  let url: URL;
  try { url = new URL(input.trim()); } catch { return null; }
  if (url.protocol !== "https:") return null;

  if (url.hostname === "docs.google.com") {
    const match = url.pathname.match(/^\/(document|spreadsheets)(?:\/u\/\d+)?\/d\/([^/]+)/);
    if (!match || !FILE_ID.test(match[2])) return null;
    const provider: DetectedProvider = match[1] === "document" ? "google_docs" : "google_sheets";
    const kind = match[1];
    return { fileId: match[2], provider, canonicalUrl: `https://docs.google.com/${kind}/d/${match[2]}/edit` };
  }

  if (url.hostname === "drive.google.com") {
    const pathMatch = url.pathname.match(/^\/file(?:\/u\/\d+)?\/d\/([^/]+)/);
    const id = pathMatch?.[1] ?? (url.pathname === "/open" ? url.searchParams.get("id") : null);
    if (!id || !FILE_ID.test(id)) return null;
    return { fileId: id, provider: null, canonicalUrl: `https://drive.google.com/file/d/${id}/view` };
  }

  return null;
}
