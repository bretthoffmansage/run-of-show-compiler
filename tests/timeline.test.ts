import { describe, expect, it } from "vitest";
import { compileTimeline, type TimelineInput } from "../lib/timeline";
import type { ExtractedItem } from "../lib/extraction";

const field = (key: ExtractedItem["fields"][number]["key"], value: string): ExtractedItem["fields"][number] => ({ key, value, origin: "source_exact", confidence: 1, evidence: { sourceId: "s", revision: "r1", snippet: value } });
const entry = (id: string, sourceId: string, sourceOrder: number, date: string | null, time: string | null, title = "Opening", speaker = "Ava"): TimelineInput => ({
  id, sourceId, sourceOrder,
  fields: [field("title", title), field("speaker", speaker), ...(date ? [field("date", date)] : []), ...(time ? [field("start_time", time)] : []), field("time_zone", "America/New_York")],
});

describe("deterministic timeline", () => {
  it("sorts chronologically, preserves tie source order and leaves missing time unplaced", () => {
    const result = compileTimeline([
      entry("late", "a", 2, "2026-11-01", "10:00"),
      entry("tie-second", "b", 1, "2026-11-01", "09:00"),
      entry("unplaced", "c", 0, "2026-11-01", null),
      entry("tie-first", "d", 0, "2026-11-01", "09:00"),
    ], { eventTimeZone: "America/New_York" });
    expect(result.placed.map(e => e.id)).toEqual(["tie-first", "tie-second", "late"]);
    expect(result.unplaced.map(e => e.id)).toEqual(["unplaced"]);
    expect(result.unplaced[0].startTime).toBeNull();
  });

  it("flags ambiguous dates, missing zone and impossible chronology without fixing facts", () => {
    const input = entry("a", "a", 0, "11/01/26", "9am");
    input.fields = [...input.fields.filter(f => f.key !== "time_zone"), field("end_time", "08:00")];
    const result = compileTimeline([input], { eventTimeZone: "America/New_York" });
    expect(result.unplaced[0].warnings).toEqual(expect.arrayContaining(["ambiguous_or_invalid_date", "missing_reliable_start_time", "source_time_zone_missing"]));
    expect(result.unplaced[0].startTime).toBeNull();
    expect(() => compileTimeline([], { eventTimeZone: "Not/AZone" })).toThrow("Invalid event time zone");
    const impossible = entry("b", "b", 0, "2026-11-01", "10:00");
    impossible.fields.push(field("end_time", "09:00"));
    expect(compileTimeline([impossible], { eventTimeZone: "America/New_York" }).placed[0].warnings).toContain("end_before_start");
  });

  it("suggests but never merges only multi-signal duplicate candidates", () => {
    const result = compileTimeline([
      entry("a", "source-a", 0, "2026-11-01", "09:00", "Welcome", "Ava"),
      entry("b", "source-b", 1, "2026-11-01", "09:00", "Welcome", "Bea"),
      entry("c", "source-c", 2, "2026-11-02", "11:00", "Welcome", "Ava"),
    ], { eventTimeZone: "America/New_York" });
    expect(result.duplicateCandidates).toEqual([{ firstId: "a", secondId: "b", evidence: ["title", "date", "start_time"] }]);
    expect(result.placed).toHaveLength(3);
  });

  it("does not misorder a different source zone without conversion", () => {
    const input = entry("z", "a", 0, "2026-11-01", "09:00");
    input.fields = [...input.fields.filter(f => f.key !== "time_zone"), field("time_zone", "Europe/London")];
    const result = compileTimeline([input], { eventTimeZone: "America/New_York" });
    expect(result.placed).toHaveLength(0);
    expect(result.unplaced[0].warnings).toContain("source_time_zone_differs_no_conversion");
  });
});
