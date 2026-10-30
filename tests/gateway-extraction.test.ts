import { describe, expect, it } from "vitest";
import { gatewayAdapter } from "../lib/gateway-extraction";
import { extractFromExcerpt } from "../lib/extraction";

const SOURCE = { sourceId: "source-1", revision: "drive:9", text: "Day 1 — Nov 3\n9:00 AM Opening Welcome — Ava Chen" };

const REPORT = {
  items: [{
    fields: [
      { key: "start_time", value: "09:00", origin: "inferred", confidence: 0.9, snippet: "9:00 AM Opening Welcome" },
      { key: "title", value: "Opening Welcome", origin: "source_exact", confidence: 0.95, snippet: "9:00 AM Opening Welcome — Ava Chen" },
    ],
  }],
};

/** Server-sent-events body in the gateway's streaming shape, split mid-JSON to exercise accumulation. */
function sseResponse(fullText: string, model = "anthropic/claude-sonnet-5.5"): Response {
  const parts: string[] = [];
  const third = Math.ceil(fullText.length / 3);
  for (let i = 0; i < fullText.length; i += third) {
    parts.push(`data: ${JSON.stringify({ model, choices: [{ delta: { content: fullText.slice(i, i + third) } }] })}\n\n`);
  }
  const body = `data: ${JSON.stringify({ model, choices: [{ delta: { role: "assistant" } }] })}\n\n${parts.join("")}data: [DONE]\n\n`;
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

describe("vercel ai gateway extraction adapter", () => {
  it("streams, accumulates, stamps evidence, and passes the validator", async () => {
    let requestBody: Record<string, unknown> | null = null;
    const adapter = gatewayAdapter({
      apiKey: "vck_test",
      fetcher: async (url, init) => {
        expect(url).toBe("https://ai-gateway.vercel.sh/v1/chat/completions");
        expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer vck_test");
        requestBody = JSON.parse(String(init?.body));
        return sseResponse(JSON.stringify(REPORT));
      },
    });
    const result = await extractFromExcerpt(SOURCE, adapter);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].fields.every(field => field.evidence.sourceId === "source-1" && field.evidence.revision === "drive:9")).toBe(true);
    expect(result.model).toBe("anthropic/claude-sonnet-5.5");
    const body = requestBody!;
    expect(body.stream).toBe(true);
    expect(body.model).toBe("anthropic/claude-sonnet-5.5");
    // Shared system block first (stable for prefix caching); source rides the user turn.
    const messages = body.messages as Array<{ role: string; content: string }>;
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toContain("<source_document>");
  });

  it("tolerates fenced JSON but rejects non-JSON output", async () => {
    const fenced = gatewayAdapter({ apiKey: "k", fetcher: async () => sseResponse("```json\n" + JSON.stringify(REPORT) + "\n```") });
    await expect(extractFromExcerpt(SOURCE, fenced)).resolves.toBeTruthy();
    const prose = gatewayAdapter({ apiKey: "k", fetcher: async () => sseResponse("Here is the schedule you asked for.") });
    await expect(extractFromExcerpt(SOURCE, prose)).rejects.toThrow("non-JSON");
  });

  it("drops fabricated snippets exactly like the direct route", async () => {
    const adapter = gatewayAdapter({
      apiKey: "k",
      fetcher: async () => sseResponse(JSON.stringify({ items: [{ fields: [{ key: "title", value: "Invented", origin: "source_exact", confidence: 1, snippet: "Invented" }] }] })),
    });
    const result = await extractFromExcerpt(SOURCE, adapter);
    expect(result.items).toHaveLength(0);
  });

  it("surfaces provider errors with their status", async () => {
    const adapter = gatewayAdapter({ apiKey: "bad", fetcher: async () => new Response("unauthorized", { status: 401 }) });
    await expect(extractFromExcerpt(SOURCE, adapter)).rejects.toThrow("Extraction model request failed (401)");
  });
});
