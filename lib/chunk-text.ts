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
