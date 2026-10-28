import type { ModelAdapter } from "./extraction";
import { SYSTEM_PROMPT, withEvidence } from "./anthropic-extraction";

/**
 * Claude-backed extraction through the Vercel AI Gateway's OpenAI-compatible
 * route (one gateway key for all providers; works from non-Vercel backends
 * like Convex, unlike the gateway's OIDC credential). Route specifics that are
 * load-bearing here:
 * - the base URL carries /v1 and the request path is chat/completions;
 * - model ids are gateway slugs, provider-prefixed (anthropic/claude-sonnet-5.5);
 * - responses stream, always — long extractions hit the HTTP timeout otherwise;
 * - there is no tool forcing on this route, so output is plain text that must
 *   be exactly one JSON object, re-validated by lib/extraction afterwards;
 * - prompt caching is automatic prefix matching only, so the shared system
 *   block stays byte-identical and per-call content rides the user turn.
 */

export const GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v1";
export const DEFAULT_GATEWAY_MODEL = "anthropic/claude-sonnet-5.5";

const OUTPUT_CONTRACT = `

Output format: respond with ONLY one JSON object — no prose, no markdown fences, nothing before or after it. Shape:
{"items":[{"fields":[{"key":"<field key>","value":"<string>","origin":"source_exact"|"inferred","confidence":<0..1>,"snippet":"<verbatim source substring>","originalLabel":"<optional source label>"}]}]}
At most 100 items and 50 fields per item. Omit originalLabel when there is none.`;

export interface GatewayAdapterConfig {
  apiKey: string;
  model?: string;
  fetcher?: (input: string, init?: RequestInit) => Promise<Response>;
}

export function gatewayAdapter(config: GatewayAdapterConfig): ModelAdapter {
  const model = config.model?.trim() || DEFAULT_GATEWAY_MODEL;
  const fetcher = config.fetcher ?? fetch;
  return {
    async infer({ untrustedSource }) {
      const response = await fetcher(`${GATEWAY_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 24_000,
          stream: true,
          messages: [
            { role: "system", content: SYSTEM_PROMPT + OUTPUT_CONTRACT },
            { role: "user", content: `<source_document>\n${untrustedSource.text}\n</source_document>\n\nExtract the run-of-show data from the source document above.` },
          ],
        }),
        signal: AbortSignal.timeout(240_000),
      });
      if (!response.ok) {
        throw new Error(`Extraction model request failed (${response.status})`);
      }
      const { text, reportedModel } = await accumulateStream(response);
      return { model, version: reportedModel ?? model, output: withEvidence(parseJsonObject(text), untrustedSource.sourceId, untrustedSource.revision) };
    },
  };
}

async function accumulateStream(response: Response): Promise<{ text: string; reportedModel: string | null }> {
  if (!response.body) throw new Error("Extraction model returned no body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let reportedModel: string | null = null;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const payload = line.startsWith("data:") ? line.slice(5).trim() : null;
        if (!payload || payload === "[DONE]") continue;
        try {
          const event: unknown = JSON.parse(payload);
          const record = event as { model?: unknown; choices?: Array<{ delta?: { content?: unknown } }> };
          if (typeof record.model === "string" && !reportedModel) reportedModel = record.model;
          const delta = record.choices?.[0]?.delta?.content;
          if (typeof delta === "string") text += delta;
        } catch { /* Keep-alive or partial line; next chunk completes it. */ }
      }
    }
  } finally {
    reader.releaseLock();
  }
  return { text, reportedModel };
}

function parseJsonObject(text: string): unknown {
  let candidate = text.trim();
  // Tolerate a fenced response despite the contract; everything else fails
  // closed in the validator.
  const fence = candidate.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) candidate = fence[1].trim();
  try {
    return JSON.parse(candidate);
  } catch {
    throw new Error("Extraction model returned non-JSON output");
  }
}
