import type { ModelAdapter, SourceExcerpt } from "./extraction";

/**
 * Deterministic no-AI fallback: one item per non-empty line, with optional
 * leading `YYYY-MM-DD` date and `HH:mm` 24-hour time. Used when no model
 * provider is configured so the review pipeline still functions.
 */
export function fallbackAdapter(): ModelAdapter {
  return {
    async infer({ untrustedSource }) {
      return { model: "deterministic-line-parser", version: "1", output: parseLines(untrustedSource) };
    },
  };
}

function parseLines(source: SourceExcerpt): unknown {
  const items: Array<{ fields: unknown[] }> = [];
  for (const line of source.text.split("\n")) {
    if (items.length >= 100) break;
    const snippet = line.trim().slice(0, 4000);
    if (!snippet) continue;
    const match = snippet.match(/^(?:(\d{4}-\d{2}-\d{2})\s+)?(?:(\d{2}:\d{2})\s+)?(.+)$/);
    if (!match) continue;
    const evidence = { sourceId: source.sourceId, revision: source.revision, snippet };
    const confidence = match[2] ? 0.85 : 0.5;
    const fields = [
      ...(match[1] ? [{ key: "date", value: match[1], origin: "source_exact", confidence: 0.9, evidence }] : []),
      ...(match[2] ? [{ key: "start_time", value: match[2], origin: "source_exact", confidence: 0.9, evidence }] : []),
      { key: "title", value: match[3].slice(0, 4000), origin: "source_exact", confidence, evidence },
    ];
    items.push({ fields });
  }
  return { items };
}
