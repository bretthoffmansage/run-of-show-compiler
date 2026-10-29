/**
 * Pure builders for the Google Sheet playbook: compiled master fields in,
 * Sheets API batchUpdate requests out. No network here — the Convex action
 * supplies tokens and sends the requests; everything about layout, ordering
 * and marking lives in this file where it is unit-testable.
 *
 * Marking convention (matches the SAGE playbook and the site):
 *   red text  = sources disagree about this value, or it is unresolved — ask the client
 *   pink text = a source edit changed this value recently
 *   Marks are text color only, never cell fills (fills mean block type on the PAG).
 */

export interface CompiledField {
  entryKey: string;
  fieldKey: string;
  value: string;
  conflict?: boolean;
  changedAt?: number;
}

export type Mark = "conflict" | "changed" | null;

export interface PagEntry {
  entryKey: string;
  date: string | null;
  start: string | null;
  end: string | null;
  title: string;
  titleMark: Mark;
  timeMark: Mark;
  speaker: string | null;
  speakerMark: Mark;
  /** True when the entry is missing a start time — rendered as a red unknown. */
  untimed: boolean;
}

export interface PagPlan {
  /** Sorted unique dates; entries with no date land in the final "Date TBC" column. */
  days: string[];
  hasUndated: boolean;
  /** Row-ordered entries grouped by day column index (days.length = TBC column). */
  byDay: PagEntry[][];
}

export const FRESH_CHANGE_MS = 24 * 60 * 60 * 1000;

// Colors as 0..1 RGB for the Sheets API.
export const RED = { red: 0.8, green: 0, blue: 0 };
export const PINK = { red: 0.91, green: 0.12, blue: 0.55 };
export const BLACK = { red: 0, green: 0, blue: 0 };

export function markFor(field: CompiledField | undefined, now: number): Mark {
  if (!field) return null;
  if (field.conflict) return "conflict";
  if (field.changedAt && now - field.changedAt < FRESH_CHANGE_MS) return "changed";
  return null;
}

export function pagPlan(fields: CompiledField[], now: number): PagPlan {
  const byEntry = new Map<string, CompiledField[]>();
  for (const field of fields) byEntry.set(field.entryKey, [...(byEntry.get(field.entryKey) ?? []), field]);
  const entries: PagEntry[] = [...byEntry].map(([entryKey, entryFields]) => {
    const get = (key: string) => entryFields.find(field => field.fieldKey === key);
    const start = get("start_time")?.value ?? null;
    return {
      entryKey,
      date: get("date")?.value ?? null,
      start,
      end: get("end_time")?.value ?? null,
      title: get("title")?.value ?? "Title unresolved",
      titleMark: get("title") ? markFor(get("title"), now) : "conflict",
      timeMark: start ? markFor(get("start_time"), now) : "conflict",
      speaker: get("speaker")?.value ?? null,
      speakerMark: markFor(get("speaker"), now),
      untimed: !start,
    };
  });
  const days = [...new Set(entries.map(entry => entry.date).filter((d): d is string => d !== null))].sort();
  const hasUndated = entries.some(entry => entry.date === null);
  const columnCount = days.length + (hasUndated ? 1 : 0);
  const byDay: PagEntry[][] = Array.from({ length: columnCount }, () => []);
  for (const entry of entries) {
    const index = entry.date === null ? columnCount - 1 : days.indexOf(entry.date);
    byDay[index].push(entry);
  }
  const sortKey = (entry: PagEntry) => `${entry.untimed ? "1" : "0"}_${entry.start ?? "99:99"}_${entry.entryKey}`;
  for (const column of byDay) column.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  return { days, hasUndated, byDay };
}

interface CellText { text: string; color?: { red: number; green: number; blue: number }; bold?: boolean }

function cell(parts: CellText[]): Record<string, unknown> {
  const text = parts.map(part => part.text).join("");
  if (!text) return {};
  // Whole-cell format follows the first part; later parts become textFormatRuns.
  const runs: Array<Record<string, unknown>> = [];
  let offset = 0;
  for (const part of parts) {
    runs.push({ startIndex: offset, format: { foregroundColor: part.color ?? BLACK, bold: part.bold ?? false } });
    offset += part.text.length;
  }
  return {
    userEnteredValue: { stringValue: text },
    textFormatRuns: runs.length > 1 ? runs : undefined,
    userEnteredFormat: { textFormat: { foregroundColor: parts[0].color ?? BLACK, bold: parts[0].bold ?? false } },
  };
}

function colorOf(mark: Mark) {
  return mark === "conflict" ? RED : mark === "changed" ? PINK : BLACK;
}

/** Rows for one grid write: header rows then the tallest day column, padded rectangular. */
export function pagGridRows(plan: PagPlan): Array<Array<Record<string, unknown>>> {
  const columns = [...plan.days, ...(plan.hasUndated ? ["Date TBC"] : [])];
  const width = 1 + columns.length;
  const pad = (row: Array<Record<string, unknown>>) => { while (row.length < width) row.push({}); return row; };
  const header = pad([cell([{ text: "Time", bold: true }]), ...columns.map(label => cell([{ text: label, bold: true }]))]);
  const height = Math.max(...plan.byDay.map(column => column.length), 0);
  const rows: Array<Array<Record<string, unknown>>> = [header];
  for (let i = 0; i < height; i++) {
    const row: Array<Record<string, unknown>> = [{}];
    for (let day = 0; day < columns.length; day++) {
      const entry = plan.byDay[day]?.[i];
      if (!entry) { row.push({}); continue; }
      const time = entry.untimed ? "time unknown" : `${entry.start}${entry.end ? ` – ${entry.end}` : ""}`;
      const parts: CellText[] = [
        { text: entry.title, color: colorOf(entry.titleMark), bold: true },
        { text: `\n${time}`, color: colorOf(entry.timeMark) },
      ];
      if (entry.speaker) parts.push({ text: `\n${entry.speaker}`, color: colorOf(entry.speakerMark) });
      row.push(cell(parts));
    }
    rows.push(pad(row));
  }
  return rows;
}

/**
 * batchUpdate requests that rewrite the compiled grid region of the PAG
 * sheet. The region is cleared wall-to-wall (CLEAR_ROWS × CLEAR_COLS) before
 * the new rows land, so removed entries do not linger from earlier writes.
 */
export const CLEAR_ROWS = 300;
export const CLEAR_COLS = 16;

export function pagWriteRequests(sheetId: number, plan: PagPlan): Array<Record<string, unknown>> {
  const rows = pagGridRows(plan);
  return [
    {
      updateCells: {
        range: { sheetId, startRowIndex: 0, endRowIndex: CLEAR_ROWS, startColumnIndex: 0, endColumnIndex: CLEAR_COLS },
        fields: "userEnteredValue,textFormatRuns,userEnteredFormat.textFormat",
      },
    },
    {
      updateCells: {
        start: { sheetId, rowIndex: 0, columnIndex: 0 },
        rows: rows.map(values => ({ values })),
        fields: "userEnteredValue,textFormatRuns,userEnteredFormat.textFormat",
      },
    },
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
