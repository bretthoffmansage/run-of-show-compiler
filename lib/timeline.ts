import type { ExtractedItem } from "./extraction";

export interface TimelineInput {
  id: string;
  sourceId: string;
  sourceOrder: number;
  fields: ExtractedItem["fields"];
}

export interface TimelineRules {
  eventTimeZone: string;
}

export interface TimelineEntry {
  id: string;
  sourceId: string;
  sourceOrder: number;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  title: string | null;
  speaker: string | null;
  warnings: string[];
  fields: ExtractedItem["fields"];
}

function value(fields: ExtractedItem["fields"], key: string): string | null {
  return fields.find(field => field.key === key)?.value ?? null;
}

function isoDate(input: string | null): string | null {
  if (!input || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
  const date = new Date(`${input}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === input ? input : null;
}

function clockTime(input: string | null): string | null {
  return input && /^([01]\d|2[0-3]):[0-5]\d$/.test(input) ? input : null;
}

function zoneValid(input: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone: input }); return true; } catch { return false; }
}

function norm(input: string | null): string {
  return (input ?? "").toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function compileTimeline(inputs: TimelineInput[], rules: TimelineRules) {
  if (!zoneValid(rules.eventTimeZone)) throw new Error("Invalid event time zone");
  const entries: TimelineEntry[] = inputs.map(input => {
    const rawDate = value(input.fields, "date");
    const rawStart = value(input.fields, "start_time");
    const rawEnd = value(input.fields, "end_time");
    const sourceZone = value(input.fields, "time_zone");
    const date = isoDate(rawDate);
    const startTime = clockTime(rawStart);
    const endTime = clockTime(rawEnd);
    const warnings: string[] = [];
    if (rawDate && !date) warnings.push("ambiguous_or_invalid_date");
    if (!date) warnings.push("missing_reliable_date");
    if (rawStart && !startTime) warnings.push("ambiguous_or_invalid_start_time");
    if (!startTime) warnings.push("missing_reliable_start_time");
    if (rawEnd && !endTime) warnings.push("ambiguous_or_invalid_end_time");
    if (startTime && endTime && endTime < startTime) warnings.push("end_before_start");
    if (!sourceZone) warnings.push("source_time_zone_missing");
    else if (!zoneValid(sourceZone)) warnings.push("source_time_zone_invalid");
    else if (sourceZone !== rules.eventTimeZone) warnings.push("source_time_zone_differs_no_conversion");
    return { id: input.id, sourceId: input.sourceId, sourceOrder: input.sourceOrder, date, startTime, endTime, title: value(input.fields, "title"), speaker: value(input.fields, "speaker"), warnings, fields: input.fields };
  });
  const indexed = entries.map((entry, index) => ({ entry, index }));
  const order = (a: typeof indexed[number], b: typeof indexed[number]) => a.entry.sourceOrder - b.entry.sourceOrder || a.index - b.index;
  const canPlace = (entry: TimelineEntry) => Boolean(entry.date && entry.startTime && !entry.warnings.includes("source_time_zone_differs_no_conversion") && !entry.warnings.includes("source_time_zone_invalid"));
  const placed = indexed.filter(({ entry }) => canPlace(entry)).sort((a, b) => a.entry.date!.localeCompare(b.entry.date!) || a.entry.startTime!.localeCompare(b.entry.startTime!) || order(a, b)).map(({ entry }) => entry);
  const unplaced = indexed.filter(({ entry }) => !canPlace(entry)).sort(order).map(({ entry }) => entry);
  const duplicateCandidates: Array<{ firstId: string; secondId: string; evidence: string[] }> = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i], b = entries[j];
      if (a.sourceId === b.sourceId || !norm(a.title) || norm(a.title) !== norm(b.title)) continue;
      const sameDate = Boolean(a.date && a.date === b.date);
      const sameTime = Boolean(a.startTime && a.startTime === b.startTime);
      const sameSpeaker = Boolean(norm(a.speaker) && norm(a.speaker) === norm(b.speaker));
      if (sameDate && (sameTime || sameSpeaker)) {
        duplicateCandidates.push({ firstId: a.id, secondId: b.id, evidence: ["title", "date", ...(sameTime ? ["start_time"] : []), ...(sameSpeaker ? ["speaker"] : [])] });
      }
    }
  }
  return { eventTimeZone: rules.eventTimeZone, placed, unplaced, duplicateCandidates };
}
