/**
 * Pure builders for the Google Sheet playbook PAG/ROS tab: compiled master
 * fields in, Sheets API batchUpdate requests out. No network here.
 *
 * Layout contract (PORTING_RULES.md, approved 2026-10-30): days run
 * HORIZONTALLY — one program column plus a paired "Day N AV Cues" column per
 * day — and content flows DOWNWARD in the source's own row order. Rows are
 * shared across days and keyed by start time, so a time in the rail (columns
 * A/B) lines up with every block that starts then. Untimed rows sit directly
 * under the row above them in the source, with a red "No time listed".
 * Every time renders exactly as the source wrote it.
 *
 * Marking: text color only, on compiler-written values only.
 *   red  = sources disagree, or a required value (time) is missing
 *   pink = changed by a source edit recently
 */

export interface CompiledField {
  entryKey: string;
  fieldKey: string;
  value: string;
  conflict?: boolean;
  changedAt?: number;
}

export type Mark = "conflict" | "changed" | null;

export const FRESH_CHANGE_MS = 24 * 60 * 60 * 1000;

// Text colors (0..1 RGB).
export const RED = { red: 0.8, green: 0, blue: 0 };
export const PINK = { red: 0.91, green: 0.12, blue: 0.55 };
export const BLACK = { red: 0, green: 0, blue: 0 };
export const WHITE = { red: 1, green: 1, blue: 1 };

// Block fills, matched to the template's language.
export const FILL = {
  session: { red: 1, green: 0.95, blue: 0.8 },        // yellow — general sessions
  sales: { red: 0.976, green: 0.796, blue: 0.611 },    // orange — re-pitch/sales sessions
  transition: { red: 0.68, green: 0.92, blue: 0.94 },  // cyan — doors/breaks/lunch
  internal: { red: 0.851, green: 0.851, blue: 0.851 }, // gray — team/rehearsal/sound test
  registration: { red: 0.957, green: 0.8, blue: 0.8 }, // salmon — registration/tech checks
} as const;
export type BlockType = keyof typeof FILL;
export const BAND_TEAL = { red: 0.173, green: 0.604, blue: 0.624 };

export function markFor(field: CompiledField | undefined, now: number): Mark {
  if (!field) return null;
  if (field.conflict) return "conflict";
  if (field.changedAt && now - field.changedAt < FRESH_CHANGE_MS) return "changed";
  return null;
}

/** Parse a clock string leniently for ORDERING only; display stays as written. */
export function parseClockMinutes(text: string | null): number | null {
  if (!text) return null;
  const match = text.trim().match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  const meridiem = match[4]?.toLowerCase();
  if (meridiem?.startsWith("p") && hours < 12) hours += 12;
  if (meridiem?.startsWith("a") && hours === 12) hours = 0;
  // No meridiem and small hour: event days run 7am–11pm, so 1–6 reads as afternoon.
  if (!meridiem && hours >= 1 && hours <= 6) hours += 12;
  // Seconds are kept (as a fraction) so 10:00:00 and 10:01:57 are distinct rows.
  return hours * 60 + minutes + seconds / 60;
}

/** Block type from what the source called the block — title keywords as fallback. */
export function classifyBlock(type: string | null, title: string, isBreak: boolean): BlockType {
  const text = `${type ?? ""} ${title}`.toLowerCase();
  if (/registration|tech check/.test(text)) return "registration";
  if (isBreak || /\bbreak\b|lunch|doors? open|stretch|dinner(?! sponsor)|networking/.test(text)) return "transition";
  if (/team meeting|rehearsal|sound test|team rally|crew|internal|debrief|on own/.test(text)) return "internal";
  if (/re-?pitch|sales|offer|enroll/.test(text)) return "sales";
  return "session";
}

interface TextPart { text: string; color?: { red: number; green: number; blue: number }; bold?: boolean }

export interface PagBlock {
  entryKey: string;
  /** null when the source row has no title text — nothing is invented. */
  title: string | null;
  titleMark: Mark;
  timeText: string | null;    // exactly as the source wrote it (start[ - end])
  timeMark: Mark;
  speaker: string | null;
  speakerMark: Mark;
  /** Labeled short facts (duration, audience, dependency). */
  meta: Array<{ label: string; text: string; mark: Mark }>;
  body: Array<{ text: string; mark: Mark }>;
  av: Array<{ label: string | null; text: string; mark: Mark }>;
  type: BlockType;
  startMin: number | null;
  endMin: number | null;
  /** Row position in the source document, when known. */
  order: number | null;
}

export interface PagDay {
  date: string;               // as written in the sources
  /** Caption lines from the source tab (e.g. "BMC45 Master Run of Show - Day 3"). */
  caption: string | null;
  /** The source's own day number ("Day 3" → 3) when it states one. */
  dayNumber: number | null;
  blocks: PagBlock[];
}

export interface PagModel {
  days: PagDay[];
}

/**
 * Everything renders somewhere. Entries whose day the sources never state
 * get their own clearly-flagged LAST column — never mixed into a real day,
 * never hidden.
 */
export const UNDATED_DAY = "Day not stated — check source";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * Sortable calendar ordinal (month*100 + day) for a date string however the
 * source writes it; null when unparseable. Every parse path lands on the
 * same scale so "Day 2 – October 20" and "October 20" compare equal.
 */
export function dateOrdinal(text: string): number | null {
  const monthName = text.toLowerCase().match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})/);
  if (monthName) return (MONTHS.indexOf(monthName[1]) + 1) * 100 + Number(monthName[2]);
  const numeric = text.match(/(\d{1,2})[/-](\d{1,2})(?:[/-]\d{2,4})?/);
  if (numeric && Number(numeric[1]) <= 12) return Number(numeric[1]) * 100 + Number(numeric[2]);
  const isoLike = text.match(/\d{4}-(\d{2})-(\d{2})/);
  if (isoLike) return Number(isoLike[1]) * 100 + Number(isoLike[2]);
  const parsed = Date.parse(text);
  if (!Number.isNaN(parsed)) {
    const date = new Date(parsed);
    return (date.getMonth() + 1) * 100 + date.getDate();
  }
  return null;
}

/** The source's own day number, from the date text or a day field. */
export function dayNumberOf(dayField: string | null, dateText: string | null): number | null {
  for (const text of [dateText, dayField]) {
    const match = text?.match(/day\s*(\d+)/i) ?? (text && /^\d+$/.test(text.trim()) ? [text, text.trim()] : null);
    if (match) return Number(match[1]);
  }
  return null;
}

const BODY_FIELDS = ["script", "additional_detail"] as const;
const META_FIELDS: Array<{ key: string; label: string }> = [
  { key: "duration", label: "Duration" },
  { key: "audience", label: "Audience" },
  { key: "dependency", label: "Depends on" },
  // time_zone is deliberately NOT rendered per block (one fact about the
  // document, not per-row data).
];
const AV_FIELDS: Array<{ key: string; label: string }> = [
  { key: "audio", label: "Audio" },
  { key: "video", label: "Video" },
  { key: "slides", label: "Slides" },
  { key: "stage_direction", label: "Stage" },
  { key: "production_note", label: "Note" },
];
/** "Visual: Logo Screen" already carries the source's own column label. */
const SELF_LABELED = /^[^:\n]{1,40}: /;

export function pagModel(fields: CompiledField[], now: number): PagModel {
  const byEntry = new Map<string, CompiledField[]>();
  // A line break inside a source cell is stored as U+2028; show it as one.
  for (const raw of fields) {
    const field = { ...raw, value: raw.value.replace(/\u2028/g, "\n") };
    byEntry.set(field.entryKey, [...(byEntry.get(field.entryKey) ?? []), field]);
  }
  const blocks: Array<PagBlock & { date: string | null; caption: string | null; dayNumber: number | null }> = [...byEntry].map(([entryKey, entryFields]) => {
    const get = (key: string) => entryFields.find(field => field.fieldKey === key);
    const start = get("start_time")?.value ?? null;
    const end = get("end_time")?.value ?? null;
    const timeMarkSource = get("start_time") ?? get("end_time");
    const order = get("source_order") ? Number(get("source_order")!.value) : null;
    return {
      entryKey,
      date: get("date")?.value ?? null,
      caption: get("day")?.value ?? null,
      dayNumber: dayNumberOf(get("day")?.value ?? null, get("date")?.value ?? null),
      title: get("title")?.value ?? null,
      titleMark: markFor(get("title"), now),
      timeText: start || end ? [start, end].filter(Boolean).join(" - ") : null,
      timeMark: markFor(timeMarkSource, now),
      speaker: get("speaker")?.value ?? null,
      speakerMark: markFor(get("speaker"), now),
      meta: META_FIELDS.flatMap(({ key, label }) => { const f = get(key); return f ? [{ label, text: f.value, mark: markFor(f, now) }] : []; }),
      body: BODY_FIELDS.flatMap(key => { const f = get(key); return f ? [{ text: f.value, mark: markFor(f, now) }] : []; }),
      av: AV_FIELDS.flatMap(({ key, label }) => {
        const f = get(key);
        if (!f) return [];
        return [{ label: SELF_LABELED.test(f.value) ? null : label, text: f.value, mark: markFor(f, now) }];
      }),
      type: classifyBlock(get("type")?.value ?? null, get("title")?.value ?? "", Boolean(get("break"))),
      startMin: parseClockMinutes(start),
      endMin: parseClockMinutes(end),
      order: order !== null && Number.isFinite(order) ? order : null,
    };
  });

  // Days run horizontally — ordered by the source's own day number, then by
  // date, then by appearance. A dated block always joins its day; only a
  // dateless one goes to the flagged last column, never another day's.
  type Group = { date: string; caption: string | null; dayNumber: number | null; appearance: number; blocks: PagBlock[] };
  const dayGroups = new Map<string, Group>();
  const undated: PagBlock[] = [];
  let appearance = 0;
  for (const block of blocks) {
    if (block.date === null) { undated.push(block); continue; }
    let group = dayGroups.get(block.date);
    if (!group) {
      group = { date: block.date, caption: null, dayNumber: block.dayNumber, appearance: appearance++, blocks: [] };
      dayGroups.set(block.date, group);
    }
    if (group.dayNumber === null && block.dayNumber !== null) group.dayNumber = block.dayNumber;
    if (group.caption === null && block.caption && block.caption !== block.date) group.caption = block.caption;
    group.blocks.push(block);
  }
  // One column per real day: date-string variants merge when they share a
  // day number or calendar date.
  const merged: Group[] = [];
  for (const group of dayGroups.values()) {
    const twin = merged.find(candidate =>
      (candidate.dayNumber !== null && group.dayNumber !== null && candidate.dayNumber === group.dayNumber) ||
      (dateOrdinal(candidate.date) !== null && dateOrdinal(candidate.date) === dateOrdinal(group.date)));
    if (twin) {
      twin.blocks.push(...group.blocks);
      if (group.date.length > twin.date.length) twin.date = group.date;
      twin.dayNumber ??= group.dayNumber;
      twin.caption ??= group.caption;
      twin.appearance = Math.min(twin.appearance, group.appearance);
    } else {
      merged.push({ ...group });
    }
  }
  const BIG = Number.MAX_SAFE_INTEGER;
  const days: PagDay[] = merged
    .sort((a, b) =>
      ((a.dayNumber ?? BIG) - (b.dayNumber ?? BIG)) ||
      ((dateOrdinal(a.date) ?? BIG) - (dateOrdinal(b.date) ?? BIG)) ||
      (a.appearance - b.appearance))
    .map(group => ({ date: group.date, caption: group.caption, dayNumber: group.dayNumber, blocks: group.blocks }));
  if (undated.length) days.push({ date: UNDATED_DAY, caption: null, dayNumber: null, blocks: undated });

  for (const day of days) {
    // Source order is the truth for a run of show; time order only when the
    // source order is unknown.
    const allOrdered = day.blocks.every(block => block.order !== null);
    day.blocks.sort((a, b) => allOrdered
      ? a.order! - b.order!
      : ((a.startMin ?? BIG) - (b.startMin ?? BIG)) || ((a.order ?? BIG) - (b.order ?? BIG)) || a.entryKey.localeCompare(b.entryKey));
    // Exact duplicate rows (same start, same title, same cues) collapse to
    // one; distinct rows that merely share a start time are all kept.
    const fingerprint = (block: PagBlock) => JSON.stringify([block.startMin, (block.title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(), block.speaker, block.av.map(a => a.text), block.body.map(b => b.text)]);
    const seen = new Set<string>();
    day.blocks = day.blocks.filter(block => {
      const id = fingerprint(block);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }
  return { days };
}

// ── Layout ─────────────────────────────────────────────────────────────────

const HEADER_ROWS = 2; // row 0: dates · row 1: Day N / Day N AV Cues bands
export const CLEAR_ROWS = 400;
export const CLEAR_COLS = 26;

export interface PlacedBlock { block: PagBlock; startRow: number; endRow: number }
export interface PagLayout {
  /** Grid rows (after the header rows): anchor minute + rail labels. */
  rows: Array<{ anchor: number; sub: number; startLabel: string; endLabel: string }>;
  placed: PlacedBlock[][];      // per day
}

/**
 * Row keys are (anchor minute, sub-index). A timed block anchors at its start
 * minute; an untimed block anchors right after the block above it in the
 * source. Blocks sharing an anchor in one day take successive sub-rows.
 * Rows are shared across days, so the rail label on each row is exactly the
 * start time of the blocks on it.
 */
export function layoutPag(model: PagModel): PagLayout {
  const keyOf = (anchor: number, sub: number) => `${anchor}:${sub}`;
  const slots = model.days.map(day => {
    const counts = new Map<number, number>();
    let previous = -1;
    return day.blocks.map(block => {
      const anchor = block.startMin ?? previous;
      const sub = counts.get(anchor) ?? 0;
      counts.set(anchor, sub + 1);
      previous = anchor;
      return { block, anchor, sub };
    });
  });
  const unique = new Map<string, { anchor: number; sub: number }>();
  for (const day of slots) for (const slot of day) unique.set(keyOf(slot.anchor, slot.sub), { anchor: slot.anchor, sub: slot.sub });
  const ordered = [...unique.values()].sort((a, b) => (a.anchor - b.anchor) || (a.sub - b.sub));
  const rowIndex = new Map(ordered.map((slot, index) => [keyOf(slot.anchor, slot.sub), HEADER_ROWS + index]));

  // Rail labels: the start (and end) text exactly as some block wrote it.
  const startText = new Map<number, string>();
  const endText = new Map<number, string>();
  for (const day of slots) for (const { block } of day) {
    if (block.startMin === null || !block.timeText) continue;
    const [startPart, endPart] = block.timeText.split(" - ");
    if (!startText.has(block.startMin)) startText.set(block.startMin, startPart);
    if (endPart && !endText.has(block.startMin)) endText.set(block.startMin, endPart);
  }
  const rows = ordered.map(slot => ({
    anchor: slot.anchor,
    sub: slot.sub,
    startLabel: slot.sub === 0 ? startText.get(slot.anchor) ?? "" : "",
    endLabel: slot.sub === 0 ? endText.get(slot.anchor) ?? "" : "",
  }));

  const placed = slots.map(day => {
    const sorted = [...day].sort((a, b) => rowIndex.get(keyOf(a.anchor, a.sub))! - rowIndex.get(keyOf(b.anchor, b.sub))!);
    return sorted.map((slot, i) => {
      const startRow = rowIndex.get(keyOf(slot.anchor, slot.sub))!;
      const nextRow = i + 1 < sorted.length ? rowIndex.get(keyOf(sorted[i + 1].anchor, sorted[i + 1].sub))! : startRow + 1;
      // Span down to the next block of this day, but no further than the
      // block's own end time.
      let endRow = startRow + 1;
      while (endRow < nextRow) {
        const row = rows[endRow - HEADER_ROWS];
        if (slot.block.endMin === null || row.anchor >= slot.block.endMin) break;
        endRow++;
      }
      return { block: slot.block, startRow, endRow };
    });
  });
  return { rows, placed };
}

// ── Rendering to Sheets API requests ───────────────────────────────────────

const FONT = { fontFamily: "Calibri", fontSize: 10 };

function cellValue(parts: TextPart[], background?: { red: number; green: number; blue: number }, wrap = true, fontSize = 10): Record<string, unknown> {
  const text = parts.map(part => part.text).join("");
  const runs: Array<Record<string, unknown>> = [];
  let offset = 0;
  for (const part of parts) {
    runs.push({ startIndex: offset, format: { ...FONT, fontSize, foregroundColor: part.color ?? BLACK, bold: part.bold ?? false } });
    offset += part.text.length;
  }
  return {
    ...(text ? { userEnteredValue: { stringValue: text } } : {}),
    ...(text && runs.length > 1 ? { textFormatRuns: runs } : {}),
    userEnteredFormat: {
      textFormat: { ...FONT, fontSize, foregroundColor: parts[0]?.color ?? BLACK, bold: parts[0]?.bold ?? false },
      ...(background ? { backgroundColor: background } : {}),
      wrapStrategy: wrap ? "WRAP" : "OVERFLOW_CELL",
      verticalAlignment: "TOP",
    },
  };
}

function colorOf(mark: Mark) {
  return mark === "conflict" ? RED : mark === "changed" ? PINK : BLACK;
}

function blockParts(block: PagBlock): TextPart[] {
  const parts: TextPart[] = [];
  const line = (part: TextPart) => parts.push(parts.length ? { ...part, text: `\n${part.text}` } : part);
  if (block.title) line({ text: block.title, color: colorOf(block.titleMark), bold: true });
  if (block.timeText) line({ text: block.timeText, color: colorOf(block.timeMark), bold: true });
  else line({ text: "No time listed", color: RED, bold: true });
  if (block.speaker) line({ text: block.speaker, color: colorOf(block.speakerMark) });
  for (const item of block.meta) {
    line({ text: `${item.label}: `, bold: true });
    parts.push({ text: item.text, color: colorOf(item.mark) });
  }
  for (const body of block.body) line({ text: body.text, color: colorOf(body.mark) });
  return parts;
}

function avParts(block: PagBlock): TextPart[] {
  const parts: TextPart[] = [];
  for (const item of block.av) {
    const lead = parts.length ? "\n" : "";
    if (item.label) {
      parts.push({ text: `${lead}${item.label}: `, bold: true });
      parts.push({ text: item.text, color: colorOf(item.mark) });
    } else {
      parts.push({ text: `${lead}${item.text}`, color: colorOf(item.mark) });
    }
  }
  return parts;
}

/**
 * Full rewrite of the PAG region: unmerge + clear, set column geometry, then
 * date headers, Day N / AV Cues bands, the time rail, and every block merged
 * over its rows. Nothing is written below the last block.
 */
export function pagWriteRequests(sheetId: number, model: PagModel): Array<Record<string, unknown>> {
  const dayCount = model.days.length;
  const width = Math.max(2 + dayCount * 2, 4);
  const layout = layoutPag(model);
  const totalRows = HEADER_ROWS + Math.max(layout.rows.length, 1);
  const matrix: Array<Array<Record<string, unknown>>> = Array.from({ length: totalRows }, () => Array.from({ length: width }, () => ({ userEnteredFormat: { textFormat: FONT, wrapStrategy: "WRAP", verticalAlignment: "TOP" } })));
  const merges: Array<Record<string, unknown>> = [];

  matrix[0][0] = cellValue([{ text: "Start", bold: true }]);
  matrix[0][1] = cellValue([{ text: "End", bold: true }]);
  model.days.forEach((day, index) => {
    const col = 2 + index * 2;
    const dayLabel = day.dayNumber !== null ? `Day ${day.dayNumber}` : "";
    const flagged = day.date === UNDATED_DAY;
    const header: TextPart[] = [{ text: day.date, color: flagged ? RED : BLACK, bold: true }];
    if (day.caption) header.push({ text: `\n${day.caption}`, color: BLACK });
    matrix[0][col] = cellValue(header, undefined, true, 12);
    merges.push({ mergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: col, endColumnIndex: col + 2 }, mergeType: "MERGE_ALL" } });
    matrix[1][col] = cellValue(dayLabel ? [{ text: dayLabel, color: WHITE, bold: true }] : [], BAND_TEAL, true, 12);
    matrix[1][col + 1] = cellValue([{ text: dayLabel ? `${dayLabel} AV Cues` : "AV Cues", color: WHITE, bold: true }], BAND_TEAL, true, 12);
  });

  layout.rows.forEach((row, index) => {
    matrix[HEADER_ROWS + index][0] = cellValue([{ text: row.startLabel }], undefined, false);
    matrix[HEADER_ROWS + index][1] = cellValue([{ text: row.endLabel }], undefined, false);
  });

  layout.placed.forEach((day, dayIndex) => {
    const col = 2 + dayIndex * 2;
    for (const { block, startRow, endRow } of day) {
      matrix[startRow][col] = cellValue(blockParts(block), FILL[block.type]);
      const av = avParts(block);
      if (av.length) matrix[startRow][col + 1] = cellValue(av, FILL.internal);
      if (endRow - startRow > 1) {
        merges.push({ mergeCells: { range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: col, endColumnIndex: col + 1 }, mergeType: "MERGE_ALL" } });
        for (let r = startRow + 1; r < endRow; r++) matrix[r][col] = cellValue([], FILL[block.type]);
        if (av.length) {
          merges.push({ mergeCells: { range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: col + 1, endColumnIndex: col + 2 }, mergeType: "MERGE_ALL" } });
          for (let r = startRow + 1; r < endRow; r++) matrix[r][col + 1] = cellValue([], FILL.internal);
        }
      }
    }
  });

  const widths: Array<Record<string, unknown>> = [
    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 2 }, properties: { pixelSize: 80 }, fields: "pixelSize" } },
  ];
  for (let day = 0; day < dayCount; day++) {
    const col = 2 + day * 2;
    widths.push({ updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: col, endIndex: col + 1 }, properties: { pixelSize: 380 }, fields: "pixelSize" } });
    widths.push({ updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: col + 1, endIndex: col + 2 }, properties: { pixelSize: 330 }, fields: "pixelSize" } });
  }

  return [
    { unmergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: CLEAR_ROWS, startColumnIndex: 0, endColumnIndex: CLEAR_COLS } } },
    {
      updateCells: {
        range: { sheetId, startRowIndex: 0, endRowIndex: CLEAR_ROWS, startColumnIndex: 0, endColumnIndex: CLEAR_COLS },
        fields: "userEnteredValue,textFormatRuns,userEnteredFormat(textFormat,backgroundColor,wrapStrategy,verticalAlignment)",
      },
    },
    ...widths,
    {
      updateCells: {
        start: { sheetId, rowIndex: 0, columnIndex: 0 },
        rows: matrix.map(values => ({ values })),
        fields: "userEnteredValue,textFormatRuns,userEnteredFormat(textFormat,backgroundColor,wrapStrategy,verticalAlignment)",
      },
    },
    ...merges,
  ];
}

/** Requests that turn freshly copied template tabs ("Copy of X") back into X. */
export function renameCopiedTabRequests(copies: Array<{ sheetId: number; title: string }>): Array<Record<string, unknown>> {
  return copies.map(copy => ({
    updateSheetProperties: {
      properties: { sheetId: copy.sheetId, title: copy.title.replace(/^Copy of /, "") },
      fields: "title",
    },
  }));
}

/** The tab the compiled run of show is written to. */
export function isPagTitle(title: string): boolean {
  return /\bPAG\b|PAG\/ROS/i.test(title);
}
