import { describe, expect, it } from "vitest";
import { anthropicAdapter } from "../lib/anthropic-extraction";
import { extractFromExcerpt } from "../lib/extraction";
import { fallbackAdapter } from "../lib/fallback-parser";

const SOURCE = { sourceId: "source-1", revision: "drive:9", text: "Day 1 — Nov 3\n9:00 AM Opening Welcome — Ava Chen" };

function anthropicResponse(toolInput: unknown): Response {
  return new Response(JSON.stringify({
    model: "claude-sonnet-5-5-20251101",
    content: [{ type: "tool_use", name: "report_extraction", input: toolInput }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("anthropic extraction adapter", () => {
  it("stamps evidence server-side and passes the provenance validator", async () => {
    let requestBody: Record<string, unknown> | null = null;
    const adapter = anthropicAdapter({
      apiKey: "test-key",
      fetcher: async (_url, init) => {
        requestBody = JSON.parse(String(init?.body));
        return anthropicResponse({
          items: [{
            fields: [
              { key: "start_time", value: "09:00", origin: "inferred", confidence: 0.9, snippet: "9:00 AM Opening Welcome" },
              { key: "title", value: "Opening Welcome", origin: "source_exact", confidence: 0.95, snippet: "9:00 AM Opening Welcome — Ava Chen" },
            ],
          }],
        });
      },
    });
    const result = await extractFromExcerpt(SOURCE, adapter);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].fields.every(field => field.evidence.sourceId === "source-1" && field.evidence.revision === "drive:9")).toBe(true);
    expect(result.version).toBe("claude-sonnet-5-5-20251101");
    // The source text rides along as data, never as instructions to obey.
    const body = requestBody!;
    expect(String((body.messages as Array<{ content: string }>)[0].content)).toContain("<source_document>");
    expect(body.tool_choice).toMatchObject({ type: "tool", name: "report_extraction" });
  });

  it("rejects output whose snippets are not verbatim from the source", async () => {
    const adapter = anthropicAdapter({
      apiKey: "test-key",
      fetcher: async () => anthropicResponse({
        items: [{ fields: [{ key: "title", value: "Invented Session", origin: "source_exact", confidence: 1, snippet: "Invented Session" }] }],
      }),
    });
    await expect(extractFromExcerpt(SOURCE, adapter)).rejects.toThrow("Invalid extraction output");
  });

  it("surfaces provider errors without retry loops", async () => {
    const adapter = anthropicAdapter({ apiKey: "k", fetcher: async () => new Response("overloaded", { status: 529 }) });
    await expect(extractFromExcerpt(SOURCE, adapter)).rejects.toThrow("Extraction model request failed (529)");
  });
});

describe("deterministic fallback adapter", () => {
  it("extracts dated, timed, and bare lines with exact snippets", async () => {
    const result = await extractFromExcerpt(
      { sourceId: "s", revision: "r", text: "2026-11-03 09:00 Opening\nUntitled block\n\n" },
      fallbackAdapter(),
    );
    expect(result.items).toHaveLength(2);
    const [first, second] = result.items;
    expect(first.fields.map(field => [field.key, field.value])).toEqual([["date", "2026-11-03"], ["start_time", "09:00"], ["title", "Opening"]]);
    expect(second.fields[0]).toMatchObject({ key: "title", value: "Untitled block", confidence: 0.5 });
  });
});
