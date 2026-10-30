/**
 * Deterministic reader for spreadsheet sources. No model, no guessing:
 * every tab is one day (its title is the day), the tab's header row says
 * what each column means, and every row after it becomes one item with
 * every non-empty cell copied verbatim. Tabs without a recognizable header
 * row are handed back as text for the model-based extractor.
 *
 * Input format is lib/google-reader's sheet dump: a "# <tab title>" line per
 * tab, then one line per row with cells joined by tabs.
 */
import type { ExtractedItem } from "./extraction";

type Field = ExtractedItem["fields"][number];
type Role = "start" | "end" | "duration" | "title" | "speaker" | "av" | "detail";

export interface SheetParseResult {
  items: ExtractedItem[];
  /** Tabs we couldn't read deterministically, in the dump format, for the model. */
  unparsedText: string;
}

const HEADER_WORD = /\b(start|end|time|duration|length|content|title|session|segment|item|description|program|presenter|speaker|talent|host|visual|video|graphics?|screen|slides?|audio|music|sound|lighting|camera|cue|chat|notes?|status|location|room)\b/i;
const CLOCK = /^\s*\d{1,2}:\d{2}(:\d{2})?\s*([ap]\.?m\.?)?\s*$/i;

function isHeaderRow(cells: string[]): boolean {
  const filled = cells.filter(cell => cell.trim());
  if (filled.length < 3) return false;
  if (filled.some(cell => CLOCK.test(cell))) return false;
  return filled.filter(cell => HEADER_WORD.test(cell)).length >= 3;
}

function roleFor(header: string, taken: Set<Role>): Role {
  const h = header.toLowerCase();
  const claim = (role: Role): Role => { taken.add(role); return role; };
  if (/start|^time$|\btime\b/.test(h) && !/pacific|\bpt\b|\bpst\b|\bmt\b|\bct\b|central|mountain/.test(h) && !taken.has("start") && !/end/.test(h)) return claim("start");
  if (/\bend\b/.test(h) && !taken.has("end")) return claim("end");
  if (/duration|length|run ?time/.test(h) && !taken.has("duration")) return claim("duration");
  if (/content|title|session|segment|item|description|program/.test(h) && !taken.has("title")) return claim("title");
  if (/presenter|speaker|talent|host|\bwho\b/.test(h) && !taken.has("speaker")) return claim("speaker");
  if (/visual|video|graphic|screen|slide|audio|music|sound|light|camera|\bcue/.test(h)) return "av";
  return "detail";
}

export function parseSheetDump(content: string, sourceId: string, revision: string): SheetParseResult {
  const tabs: Array<{ title: string; lines: string[] }> = [];
  let current: { title: string; lines: string[] } | null = null;
  for (const line of content.split("\n")) {
    if (line.startsWith("# ")) {
      current = { title: line.slice(2).trim(), lines: [] };
      tabs.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (!tabs.length) return { items: [], unparsedText: content };

  const items: ExtractedItem[] = [];
  const unparsed: string[] = [];
  const evidence = (snippet: string) => ({ sourceId, revision, snippet });
  const exact = (key: Field["key"], value: string): Field => ({ key, value, origin: "source_exact", confidence: 1, evidence: evidence(value) });

  for (const tab of tabs) {
    const rows = tab.lines.map(line => line.split("\t"));
    const headerIndex = rows.findIndex(isHeaderRow);
    if (headerIndex < 0) {
      unparsed.push([`# ${tab.title}`, ...tab.lines].join("\n"));
      continue;
    }
    // Lines above the header row (e.g. "BMC45 Master Run of Show - Day 3")
    // are the tab's caption: carried on every row as the day field.
    const caption = rows.slice(0, headerIndex).map(cells => cells.filter(c => c.trim()).join(" ").trim()).filter(Boolean).join(" · ");
    let headers = rows[headerIndex].map(cell => cell.trim());
    let roles: Role[] = [];
    const assign = () => {
      const taken = new Set<Role>();
      roles = headers.map(header => (header ? roleFor(header, taken) : "detail"));
    };
    assign();
    let order = 0;
    for (let r = headerIndex + 1; r < rows.length; r++) {
      const cells = rows[r];
      if (!cells.some(cell => cell.trim())) continue;
      if (isHeaderRow(cells)) { headers = cells.map(cell => cell.trim()); assign(); continue; }
      const fields: Field[] = [exact("date", tab.title)];
      if (caption) fields.push({ key: "day", value: caption, origin: "source_exact", confidence: 1, evidence: evidence(caption.split(" · ")[0]) });
      const av: Array<{ label: string; value: string }> = [];
      const details: Array<{ label: string; value: string }> = [];
      let title: string | null = null;
      const leftovers: Array<{ label: string; value: string; role: Role }> = [];
      cells.forEach((raw, index) => {
        const value = raw.trim();
        if (!value) return;
        const role = roles[index] ?? "detail";
        const label = headers[index] || `Column ${index + 1}`;
        switch (role) {
          case "start": fields.push(exact("start_time", value)); break;
          case "end": fields.push(exact("end_time", value)); break;
          case "duration": fields.push(exact("duration", value)); break;
          case "title": title = value; break;
          case "speaker": fields.push(exact("speaker", value)); break;
          case "av": av.push({ label, value }); leftovers.push({ label, value, role }); break;
          default: details.push({ label, value }); leftovers.push({ label, value, role }); break;
        }
      });
      // A label row — one text cell and nothing else besides times, like
      // "8:30:00 AM … CREW CALL TIME" — uses that text as its title (moved,
      // not duplicated). A row with several cells keeps every cell under its
      // own column name; a status like "Chat Open" never becomes a title.
      if (title === null && leftovers.length === 1 && leftovers[0].role === "detail" && !CLOCK.test(leftovers[0].value)) {
        const promote = leftovers[0];
        {
          title = promote.value;
          details.splice(details.findIndex(d => d.label === promote.label && d.value === promote.value), 1);
        }
      }
      if (title !== null) fields.push(exact("title", title));
      if (av.length) {
        const value = av.map(item => `${item.label}: ${item.value}`).join("\n");
        fields.push({ key: "production_note", value, origin: "inferred", confidence: 1, evidence: evidence(av[0].value) });
      }
      if (details.length) {
        const value = details.map(item => `${item.label}: ${item.value}`).join("\n");
        fields.push({ key: "additional_detail", value, origin: "inferred", confidence: 1, evidence: evidence(details[0].value) });
      }
      const anchor = fields.find(f => f.key !== "date" && f.key !== "day")?.evidence.snippet ?? tab.title;
      fields.push({ key: "source_order", value: String(order++), origin: "inferred", confidence: 1, evidence: evidence(anchor) });
      items.push({ fields });
    }
  }
  return { items, unparsedText: unparsed.join("\n\n") };
}
