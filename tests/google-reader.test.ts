import { describe, expect, it } from "vitest";
import { GoogleReadError, readGoogleSource, type Fetcher } from "../lib/google-reader";

const metadata = (mimeType: string) => ({ id: "abc123", mimeType, version: "17", modifiedTime: "2026-10-28T12:00:00Z" });

function mockFetch(responses: Array<{ status?: number; body: unknown }>, calls: Array<{ url: string; authorization: string }>): Fetcher {
  return async (url, init) => {
    calls.push({ url, authorization: new Headers(init?.headers).get("Authorization") ?? "" });
    const next = responses.shift();
    if (!next) throw new Error("unexpected fetch");
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200, headers: { "content-type": "application/json" } });
  };
}

describe("server-use Google read adapter", () => {
  it("reads Docs text and Drive revision through fixed endpoints", async () => {
    const calls: Array<{ url: string; authorization: string }> = [];
    const fetcher = mockFetch([
      { body: metadata("application/vnd.google-apps.document") },
      { body: { tabs: [{ documentTab: { body: { content: [{ paragraph: { elements: [{ textRun: { content: "Opening\n" } }] } }] } } }] } },
    ], calls);
    const result = await readGoogleSource({ url: "https://docs.google.com/document/d/abc123/edit", provider: "google_docs", accessToken: "dummy-secret", fetcher });
    expect(result).toMatchObject({ fileId: "abc123", revision: "drive:17", text: "Opening\n" });
    expect(JSON.stringify(result)).not.toContain("dummy-secret");
    expect(calls).toHaveLength(2);
    expect(calls.every(c => c.authorization === "Bearer dummy-secret")).toBe(true);
    expect(calls[0].url).toMatch(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/abc123/);
    expect(calls[1].url).toMatch(/^https:\/\/docs\.googleapis\.com\/v1\/documents\/abc123/);
  });

  it("reads Sheet tabs and rows without evaluating cell formulas", async () => {
    const calls: Array<{ url: string; authorization: string }> = [];
    const fetcher = mockFetch([
      { body: metadata("application/vnd.google-apps.spreadsheet") },
      { body: { sheets: [{ properties: { title: "Day 1" } }, { properties: { title: "MC's Notes" } }] } },
      { body: { valueRanges: [{ values: [["Time", "Cue"], ["09:00", "Open"]] }, { values: [["=IMPORTXML(...)" ]] }] } },
    ], calls);
    const result = await readGoogleSource({ url: "https://docs.google.com/spreadsheets/d/abc123/edit", provider: "google_sheets", accessToken: "dummy-secret", fetcher });
    expect(result.text).toContain("# Day 1\nTime\tCue\n09:00\tOpen");
    expect(result.text).toContain("=IMPORTXML(...)");
    expect(calls[2].url).toContain("values:batchGet");
    expect(JSON.stringify(result)).not.toContain("dummy-secret");
  });

  it("rejects arbitrary URLs before any request and classifies auth, rate and size errors without token leakage", async () => {
    const calls: Array<{ url: string; authorization: string }> = [];
    const noFetch = mockFetch([], calls);
    await expect(readGoogleSource({ url: "https://docs.google.com.evil.test/document/d/abc123", provider: "google_docs", accessToken: "dummy-secret", fetcher: noFetch })).rejects.toMatchObject({ code: "invalid_source" });
    expect(calls).toHaveLength(0);
    for (const [status, code] of [[401, "needs_reauthorization"], [403, "access_removed"], [429, "rate_limited"], [503, "unavailable"]] as const) {
      const fetcher = mockFetch([{ status, body: { error: "dummy-secret" } }], []);
      await expect(readGoogleSource({ url: "https://docs.google.com/document/d/abc123/edit", provider: "google_docs", accessToken: "dummy-secret", fetcher })).rejects.toMatchObject({ code });
    }
    const huge = mockFetch([{ body: { ...metadata("application/vnd.google-apps.document"), padding: "x".repeat(600_000) } }], []);
    await expect(readGoogleSource({ url: "https://docs.google.com/document/d/abc123/edit", provider: "google_docs", accessToken: "dummy-secret", fetcher: huge })).rejects.toMatchObject({ code: "too_large" });
    expect(new GoogleReadError("unavailable").message).not.toContain("dummy-secret");
  });
});
