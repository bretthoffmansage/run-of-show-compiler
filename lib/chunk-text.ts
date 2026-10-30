/** A chunk plus the tab/section header that governs every row in it. */
export interface SectionChunk { header: string | null; text: string }

/**
 * Split by section first, then by size. Spreadsheet sources are stored with
 * one "# <tab title>" line per tab; every chunk belongs to exactly one tab
 * and starts with that tab's header line, so no row is ever cut off from the
 * day/date its tab names. Documents without "# " lines are one section.
 */
export function chunkBySections(text: string, maxBytes = 28_000): SectionChunk[] {
  const sections: Array<{ header: string | null; lines: string[] }> = [];
  let current: { header: string | null; lines: string[] } = { header: null, lines: [] };
  for (const line of text.split("\n")) {
    if (line.startsWith("# ")) {
      if (current.lines.some(l => l.trim())) sections.push(current);
      current = { header: line.slice(2).trim(), lines: [line] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.some(l => l.trim())) sections.push(current);
  const out: SectionChunk[] = [];
  for (const section of sections) {
    const headerLine = section.header !== null ? `# ${section.header}` : null;
    const body = headerLine ? section.lines.slice(1).join("\n") : section.lines.join("\n");
    const budget = headerLine ? Math.max(1_000, maxBytes - new TextEncoder().encode(headerLine).length - 1) : maxBytes;
    const pieces = chunkByLines(body, budget);
    if (!pieces.length && headerLine) out.push({ header: section.header, text: headerLine });
    for (const piece of pieces) out.push({ header: section.header, text: headerLine ? `${headerLine}\n${piece}` : piece });
  }
  return out;
}

/** True when a section header names a day or a date ("Day 3 – October 21"). */
export function headerNamesDay(header: string | null): boolean {
  if (!header) return false;
  return /\bday\s*\d+\b/i.test(header)
    || /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i.test(header)
    || /\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*day\b/i.test(header)
    || /\b\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?\b/.test(header);
}

/**
 * Split source text into byte-bounded chunks on line boundaries so each stays
 * within the extraction validator's input limit. Snippet provenance holds
 * because every chunk is a contiguous substring of the original text.
 */
export function chunkByLines(text: string, maxBytes = 28_000): string[] {
  const encoder = new TextEncoder();
  if (encoder.encode(text).length <= maxBytes) return text.trim() ? [text] : [];
  const chunks: string[] = [];
  let current: string[] = [];
  let size = 0;
  const flush = () => {
    if (current.length) chunks.push(current.join("\n"));
    current = [];
    size = 0;
  };
  for (const line of text.split("\n")) {
    const lineBytes = encoder.encode(line).length + 1;
    if (lineBytes > maxBytes) {
      flush();
      let piece = "";
      for (const char of line) {
        if (encoder.encode(piece + char).length > maxBytes) { chunks.push(piece); piece = ""; }
        piece += char;
      }
      if (piece) { current = [piece]; size = encoder.encode(piece).length + 1; }
      continue;
    }
    if (size + lineBytes > maxBytes) flush();
    current.push(line);
    size += lineBytes;
  }
  flush();
  return chunks.filter(chunk => chunk.trim());
}
