import { describe, expect, it } from "vitest";
import { GoogleReadError, readGoogleSource, type Fetcher } from "../lib/google-reader";
import { parseGoogleSourceUrl } from "../lib/google-url";

const metadata = (mimeType: string) => ({ id: "abc123def456", mimeType, version: "17", modifiedTime: "2026-10-28T12:00:00Z" });

function mockFetch(responses: Array<{ status?: number; body: unknown }>, calls: Array<{ url: string; authorization: string }>): Fetcher {
  return async (url, init) => {
    calls.push({ url, authorization: new Headers(init?.headers).get("Authorization") ?? "" });
    const next = responses.shift();
    if (!next) throw new Error("unexpected fetch");
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200, headers: { "content-type": "application/json" } });
  };
}

describe("Google source URL parsing", () => {
  it("accepts the link shapes people actually paste and rejects lookalikes", () => {
    expect(parseGoogleSourceUrl("https://docs.google.com/spreadsheets/d/abc123def456/edit?usp=sharing")).toMatchObject({ fileId: "abc123def456", provider: "google_sheets" });
    expect(parseGoogleSourceUrl("https://docs.google.com/document/u/0/d/abc123def456/edit")).toMatchObject({ fileId: "abc123def456", provider: "google_docs" });
    expect(parseGoogleSourceUrl("https://drive.google.com/file/d/abc123def456/view?usp=drive_link")).toMatchObject({ fileId: "abc123def456", provider: null });
    expect(parseGoogleSourceUrl("https://drive.google.com/open?id=abc123def456")).toMatchObject({ fileId: "abc123def456", provider: null });
    expect(parseGoogleSourceUrl("https://docs.google.com.evil.test/document/d/abc123def456")).toBeNull();
    expect(parseGoogleSourceUrl("http://docs.google.com/document/d/abc123def456")).toBeNull();
    expect(parseGoogleSourceUrl("https://example.com/spreadsheets/d/abc123def456")).toBeNull();
  });
});

describe("server-use Google read adapter", () => {
  it("reads Docs text and Drive revision through fixed endpoints", async () => {
    const calls: Array<{ url: string; authorization: string }> = [];
    const fetcher = mockFetch([
      { body: metadata("application/vnd.google-apps.document") },
      { body: { tabs: [{ documentTab: { body: { content: [{ paragraph: { elements: [{ textRun: { content: "Opening\n" } }] } }] } } }] } },
    ], calls);
    const result = await readGoogleSource({ url: "https://docs.google.com/document/d/abc123def456/edit", accessToken: "dummy-secret", fetcher });
    expect(result).toMatchObject({ fileId: "abc123def456", revision: "drive:17:r2", text: "Opening\n", provider: "google_docs" });
    expect(JSON.stringify(result)).not.toContain("dummy-secret");
    expect(calls).toHaveLength(2);
    expect(calls.every(c => c.authorization === "Bearer dummy-secret")).toBe(true);
    expect(calls[0].url).toMatch(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/abc123def456/);
    // Shared-drive files 404 without this flag, which would read as lost access.
    expect(calls[0].url).toContain("supportsAllDrives=true");
    expect(calls[1].url).toMatch(/^https:\/\/docs\.googleapis\.com\/v1\/documents\/abc123def456/);
  });

  it("reads Sheet tabs and rows without evaluating cell formulas", async () => {
    const calls: Array<{ url: string; authorization: string }> = [];
    const fetcher = mockFetch([
      { body: metadata("application/vnd.google-apps.spreadsheet") },
      { body: { sheets: [{ properties: { title: "Day 1" } }, { properties: { title: "MC's Notes" } }] } },
      { body: { valueRanges: [{ values: [["Time", "Cue"], ["09:00", "Open"]] }, { values: [["=IMPORTXML(...)" ]] }] } },
    ], calls);
    const result = await readGoogleSource({ url: "https://docs.google.com/spreadsheets/d/abc123def456/edit", accessToken: "dummy-secret", fetcher });
    expect(result.text).toContain("# Day 1\nTime\tCue\n09:00\tOpen");
    expect(result.text).toContain("=IMPORTXML(...)");
    expect(calls[2].url).toContain("values:batchGet");
    expect(JSON.stringify(result)).not.toContain("dummy-secret");
  });

  it("detects the real file kind from Drive metadata, whatever the link said", async () => {
    // A drive.google.com link that turns out to be a spreadsheet reads as one.
    const fetcher = mockFetch([
      { body: metadata("application/vnd.google-apps.spreadsheet") },
      { body: { sheets: [{ properties: { title: "Agenda" } }] } },
      { body: { valueRanges: [{ values: [["09:00", "Doors"]] }] } },
    ], []);
    const result = await readGoogleSource({ url: "https://drive.google.com/file/d/abc123def456/view", accessToken: "dummy-secret", fetcher });
    expect(result.provider).toBe("google_sheets");
    expect(result.text).toContain("09:00\tDoors");
  });

  it("gives Office files stored in Drive a distinct, actionable error", async () => {
    const fetcher = mockFetch([{ body: metadata("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") }], []);
    await expect(readGoogleSource({ url: "https://docs.google.com/spreadsheets/d/abc123def456/edit", accessToken: "dummy-secret", fetcher })).rejects.toMatchObject({ code: "office_file" });
  });

  it("rejects arbitrary URLs before any request and classifies auth, rate and size errors without token leakage", async () => {
    const calls: Array<{ url: string; authorization: string }> = [];
    const noFetch = mockFetch([], calls);
    await expect(readGoogleSource({ url: "https://docs.google.com.evil.test/document/d/abc123def456", accessToken: "dummy-secret", fetcher: noFetch })).rejects.toMatchObject({ code: "invalid_source" });
    expect(calls).toHaveLength(0);
    for (const [status, code] of [[401, "needs_reauthorization"], [403, "access_removed"], [404, "access_removed"], [429, "rate_limited"], [503, "unavailable"]] as const) {
      const fetcher = mockFetch([{ status, body: { error: "denied" } }], []);
      await expect(readGoogleSource({ url: "https://docs.google.com/document/d/abc123def456/edit", accessToken: "dummy-secret", fetcher })).rejects.toMatchObject({ code });
    }
    // The three flavors of 403 get told apart by the error body.
    const disabled = mockFetch([{ status: 403, body: { error: { errors: [{ reason: "accessNotConfigured" }], message: "Google Drive API has not been used in project 12345 before or it is disabled." } } }], []);
    await expect(readGoogleSource({ url: "https://docs.google.com/document/d/abc123def456/edit", accessToken: "dummy-secret", fetcher: disabled })).rejects.toMatchObject({ code: "api_disabled" });
    const scoped = mockFetch([{ status: 403, body: { error: { message: "Request had insufficient authentication scopes.", status: "PERMISSION_DENIED" } } }], []);
    await expect(readGoogleSource({ url: "https://docs.google.com/document/d/abc123def456/edit", accessToken: "dummy-secret", fetcher: scoped })).rejects.toMatchObject({ code: "scope_insufficient" });
    const huge = mockFetch([{ body: { ...metadata("application/vnd.google-apps.document"), padding: "x".repeat(9_000_000) } }], []);
    await expect(readGoogleSource({ url: "https://docs.google.com/document/d/abc123def456/edit", accessToken: "dummy-secret", fetcher: huge })).rejects.toMatchObject({ code: "too_large" });
    expect(new GoogleReadError("unavailable").message).not.toContain("dummy-secret");
  });
});
