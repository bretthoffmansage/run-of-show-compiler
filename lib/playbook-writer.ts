/**
 * Pure builders for the Google Sheet playbook PAG/ROS tab: compiled master
 * fields in, Sheets API batchUpdate requests out. No network here.
 *
 * Layout contract (PORTING_RULES.md): days run HORIZONTALLY — one program
 * column plus a paired "Day N AV Cues" column per day — and content flows
 * DOWNWARD over time against a shared Start/End time rail in columns A/B.
 * Blocks are merged cells spanning their time range, filled by block type.
 * Times render exactly as the sources wrote them; sorting and spanning use
 * parsed values internally, but nothing is reformatted or converted.
 *
 * Marking: text color only, on compiler-written values only.
 *   red  = sources disagree or the value is unresolved
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
export const BAND_GRAY = { red: 0.35, green: 0.35, blue: 0.35 };

export function markFor(field: CompiledField | undefined, now: number): Mark {
  if (!field) return null;
  if (field.conflict) return "conflict";
  if (field.changedAt && now - field.changedAt < FRESH_CHANGE_MS) return "changed";
  return null;
}

/** Parse a clock string leniently for ORDERING only; display stays as written. */
export function parseClockMinutes(text: string | null): number | null {
  if (!text) return null;
  const match = text.trim().match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  if (hours > 23 || minutes > 59) return null;
  const meridiem = match[3]?.toLowerCase();
  if (meridiem?.startsWith("p") && hours < 12) hours += 12;
  if (meridiem?.startsWith("a") && hours === 12) hours = 0;
  // No meridiem and small hour: event days run 7am–11pm, so 1–6 reads as afternoon.
  if (!meridiem && hours >= 1 && hours <= 6) hours += 12;
  return hours * 60 + minutes;
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
  title: string;
  titleMark: Mark;
  timeText: string | null;    // exactly as the source wrote it (start[ - end])
  timeMark: Mark;
  speaker: string | null;
  speakerMark: Mark;
  body: Array<{ text: string; mark: Mark }>;
  av: Array<{ label: string; text: string; mark: Mark }>;
  type: BlockType;
  startMin: number | null;
  endMin: number | null;
}

export interface PagDay {
  date: string;               // as written in the sources
  blocks: PagBlock[];
}

export interface PagModel {
  days: PagDay[];
  untimed: PagBlock[];        // no parseable start time: listed under the grid
  /** Sorted distinct minute boundaries that define the grid rows. */
  rail: Array<{ minute: number; label: string }>;
}

const BODY_FIELDS = ["script", "additional_detail"] as const;
const AV_FIELDS: Array<{ key: string; label: string }> = [
  { key: "audio", label: "Audio" },
  { key: "video", label: "Video" },
  { key: "slides", label: "Slides" },
  { key: "stage_direction", label: "Stage" },
  { key: "production_note", label: "Note" },
];

export function pagModel(fields: CompiledField[], now: number): PagModel {
  const byEntry = new Map<string, CompiledField[]>();
  for (const field of fields) byEntry.set(field.entryKey, [...(byEntry.get(field.entryKey) ?? []), field]);
  const blocks: Array<PagBlock & { date: string | null }> = [...byEntry].map(([entryKey, entryFields]) => {
    const get = (key: string) => entryFields.find(field => field.fieldKey === key);
    const start = get("start_time")?.value ?? null;
    const end = get("end_time")?.value ?? null;
    const timeMarkSource = get("start_time") ?? get("end_time");
    return {
      entryKey,
      date: get("date")?.value ?? null,
      title: get("title")?.value ?? "Title unresolved",
      titleMark: get("title") ? markFor(get("title"), now) : "conflict",
      timeText: start || end ? [start, end].filter(Boolean).join(" - ") : null,
      timeMark: markFor(timeMarkSource, now),
      speaker: get("speaker")?.value ?? null,
      speakerMark: markFor(get("speaker"), now),
      body: BODY_FIELDS.flatMap(key => { const f = get(key); return f ? [{ text: f.value, mark: markFor(f, now) }] : []; }),
      av: AV_FIELDS.flatMap(({ key, label }) => { const f = get(key); return f ? [{ label, text: f.value, mark: markFor(f, now) }] : []; }),
      type: classifyBlock(get("type")?.value ?? null, get("title")?.value ?? "", Boolean(get("break"))),
      startMin: parseClockMinutes(start),
      endMin: parseClockMinutes(end),
    };
  });

  // Days run horizontally, ordered chronologically when the date strings
  // parse, otherwise by first appearance. Undated blocks join the first day
  // only if timed; otherwise they are untimed footnotes.
  const dateOrder: string[] = [];
  for (const block of blocks) if (block.date !== null && !dateOrder.includes(block.date)) dateOrder.push(block.date);
  const parsedDate = (value: string) => { const t = Date.parse(value); return Number.isNaN(t) ? null : t; };
  dateOrder.sort((a, b) => {
    const pa = parsedDate(a); const pb = parsedDate(b);
    if (pa !== null && pb !== null) return pa - pb;
    return 0; // keep appearance order when either side is unparseable
  });
  const days: PagDay[] = dateOrder.map(date => ({ date, blocks: [] }));
  const undatedDay: PagDay = { date: "", blocks: [] };
  const untimed: PagBlock[] = [];
  for (const block of blocks) {
    if (block.startMin === null) { untimed.push(block); continue; }
    const day = block.date === null ? (days[0] ?? undatedDay) : days[dateOrder.indexOf(block.date)];
    day.blocks.push(block);
  }
  if (!days.length && undatedDay.blocks.length) days.push(undatedDay);
  for (const day of days) day.blocks.sort((a, b) => (a.startMin! - b.startMin!) || a.entryKey.localeCompare(b.entryKey));

  // Shared time rail: every start/end boundary across all days, labeled with
  // the first form a source wrote for that minute.
  const labels = new Map<number, string>();
  for (const day of days) for (const block of day.blocks) {
    if (block.startMin !== null && !labels.has(block.startMin)) {
      labels.set(block.startMin, (block.timeText ?? "").split(" - ")[0] || "");
    }
    if (block.endMin !== null && !labels.has(block.endMin)) {
      const parts = (block.timeText ?? "").split(" - ");
      labels.set(block.endMin, parts[1] ?? "");
    }
  }
  const rail = [...labels.entries()].map(([minute, label]) => ({ minute, label })).sort((a, b) => a.minute - b.minute);
  return { days, untimed, rail };
}

// ── Rendering to Sheets API requests ───────────────────────────────────────

const HEADER_ROWS = 2; // row 0: dates · row 1: Day N / Day N AV Cues bands
export const CLEAR_ROWS = 300;
export const CLEAR_COLS = 26;

function cellValue(parts: TextPart[], background?: { red: number; green: number; blue: number }, wrap = true): Record<string, unknown> {
  const text = parts.map(part => part.text).join("");
  const runs: Array<Record<string, unknown>> = [];
  let offset = 0;
  for (const part of parts) {
    runs.push({ startIndex: offset, format: { foregroundColor: part.color ?? BLACK, bold: part.bold ?? false } });
    offset += part.text.length;
  }
  return {
    ...(text ? { userEnteredValue: { stringValue: text } } : {}),
    ...(text && runs.length > 1 ? { textFormatRuns: runs } : {}),
    userEnteredFormat: {
      textFormat: { foregroundColor: parts[0]?.color ?? BLACK, bold: parts[0]?.bold ?? false },
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
  const parts: TextPart[] = [{ text: block.title, color: colorOf(block.titleMark), bold: true }];
  if (block.timeText) parts.push({ text: `\n${block.timeText}`, color: colorOf(block.timeMark), bold: true });
  else parts.push({ text: "\n( -- time)", color: RED });
  if (block.speaker) parts.push({ text: `\n${block.speaker}`, color: colorOf(block.speakerMark) });
  for (const line of block.body) parts.push({ text: `\n\n${line.text}`, color: colorOf(line.mark) });
  return parts;
}

function avParts(block: PagBlock): TextPart[] {
  const parts: TextPart[] = [];
  for (const item of block.av) {
    parts.push({ text: parts.length ? `\n${item.label}: ` : `${item.label}: `, bold: true });
    parts.push({ text: item.text, color: colorOf(item.mark) });
  }
  return parts;
}

/**
 * Full rewrite of the PAG region: unmerge + clear, then the date header row,
 * the Day N / AV Cues band row, the time rail, each day's merged blocks, and
 * untimed entries under the grid.
 */
export function pagWriteRequests(sheetId: number, model: PagModel): Array<Record<string, unknown>> {
  const dayCount = model.days.length;
  const width = Math.max(2 + dayCount * 2, 3);
  const minuteToRow = new Map<number, number>();
  model.rail.forEach((stop, index) => minuteToRow.set(stop.minute, HEADER_ROWS + index));
  const gridRows = HEADER_ROWS + Math.max(model.rail.length, 1);
  const untimedStart = gridRows + 1;
  const totalRows = untimedStart + model.untimed.length + 1;

  // Cell matrix, all plain by default.
  const matrix: Array<Array<Record<string, unknown>>> = Array.from({ length: totalRows }, () => Array.from({ length: width }, () => ({ userEnteredFormat: { wrapStrategy: "WRAP", verticalAlignment: "TOP" } })));
  const merges: Array<Record<string, unknown>> = [];

  // Header rows.
  matrix[0][0] = cellValue([{ text: "Start", bold: true }]);
  matrix[0][1] = cellValue([{ text: "End", bold: true }]);
  matrix[1][0] = cellValue([{ text: "Time", bold: true }]);
  model.days.forEach((day, index) => {
    const col = 2 + index * 2;
    matrix[0][col] = cellValue([{ text: day.date, color: BLACK, bold: true }]);
    merges.push({ mergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: col, endColumnIndex: col + 2 }, mergeType: "MERGE_ALL" } });
    matrix[1][col] = cellValue([{ text: `Day ${index + 1}`, color: WHITE, bold: true }], BAND_TEAL);
    matrix[1][col + 1] = cellValue([{ text: `Day ${index + 1} AV Cues`, color: WHITE, bold: true }], BAND_TEAL);
  });

  // Time rail labels, exactly as first written.
  model.rail.forEach((stop, index) => {
    const row = HEADER_ROWS + index;
    const next = model.rail[index + 1];
    matrix[row][0] = cellValue([{ text: stop.label }], undefined, false);
    matrix[row][1] = cellValue([{ text: next?.label ?? "" }], undefined, false);
  });

  // Blocks: merged over their time span, filled by type; AV cues beside them.
  model.days.forEach((day, dayIndex) => {
    const col = 2 + dayIndex * 2;
    day.blocks.forEach((block, blockIndex) => {
      const startRow = minuteToRow.get(block.startMin!) ?? HEADER_ROWS;
      const nextStart = day.blocks[blockIndex + 1]?.startMin ?? null;
      const endMinute = block.endMin ?? nextStart;
      let endRow = endMinute !== null && minuteToRow.has(endMinute) ? minuteToRow.get(endMinute)! : startRow + 1;
      if (endRow <= startRow) endRow = startRow + 1;
      matrix[startRow][col] = cellValue(blockParts(block), FILL[block.type]);
      if (endRow - startRow > 1) {
        merges.push({ mergeCells: { range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: col, endColumnIndex: col + 1 }, mergeType: "MERGE_ALL" } });
        // Paint the span so the fill covers the whole block, not just the anchor.
        for (let r = startRow + 1; r < endRow; r++) matrix[r][col] = cellValue([], FILL[block.type]);
      }
      const av = avParts(block);
      if (av.length) {
        matrix[startRow][col + 1] = cellValue(av, FILL.internal);
        if (endRow - startRow > 1) {
          merges.push({ mergeCells: { range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: col + 1, endColumnIndex: col + 2 }, mergeType: "MERGE_ALL" } });
          for (let r = startRow + 1; r < endRow; r++) matrix[r][col + 1] = cellValue([], FILL.internal);
        }
      }
    });
  });

  // Untimed entries: listed under the grid with a red unknown time.
  if (model.untimed.length) {
    matrix[untimedStart - 1][0] = cellValue([{ text: "No time provided", bold: true, color: RED }]);
    model.untimed.forEach((block, index) => {
      matrix[untimedStart + index][2] = cellValue(blockParts(block), FILL[block.type]);
      const av = avParts(block);
      if (av.length) matrix[untimedStart + index][3] = cellValue(av, FILL.internal);
    });
  }

  return [
    { unmergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: CLEAR_ROWS, startColumnIndex: 0, endColumnIndex: CLEAR_COLS } } },
    {
      updateCells: {
        range: { sheetId, startRowIndex: 0, endRowIndex: CLEAR_ROWS, startColumnIndex: 0, endColumnIndex: CLEAR_COLS },
        fields: "userEnteredValue,textFormatRuns,userEnteredFormat(textFormat,backgroundColor,wrapStrategy,verticalAlignment)",
      },
    },
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
