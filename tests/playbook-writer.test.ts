import { describe, expect, it } from "vitest";
import {
  classifyBlock, FILL, FRESH_CHANGE_MS, isPagTitle, layoutPag, pagModel, pagWriteRequests,
  parseClockMinutes, PINK, RED, renameCopiedTabRequests, UNDATED_DAY,
} from "../lib/playbook-writer";

const NOW = 1_800_000_000_000;

const field = (entryKey: string, fieldKey: string, value: string, extra: { conflict?: boolean; changedAt?: number } = {}) =>
  ({ entryKey, fieldKey, value, ...extra });

describe("time parsing (ordering only — display stays as written)", () => {
  it("parses the formats client sheets actually use, to the second", () => {
    expect(parseClockMinutes("9:40:00 AM")).toBe(9 * 60 + 40);
    expect(parseClockMinutes("10:01:57 AM")).toBeCloseTo(10 * 60 + 1 + 57 / 60);
    expect(parseClockMinutes("1:00pm")).toBe(13 * 60);
    expect(parseClockMinutes("14:30")).toBe(14 * 60 + 30);
    expect(parseClockMinutes("2:30")).toBe(14 * 60 + 30);
    expect(parseClockMinutes("12:15 AM")).toBe(15);
    expect(parseClockMinutes("TBD")).toBeNull();
    expect(parseClockMinutes(null)).toBeNull();
  });
});

describe("block classification follows what the source calls the block", () => {
  it("maps the template's block language onto fills", () => {
    expect(classifyBlock("General Session", "D1S1: Opening", false)).toBe("session");
    expect(classifyBlock(null, "Lunch Break (45 min)", false)).toBe("transition");
    expect(classifyBlock(null, "Doors Open", false)).toBe("transition");
    expect(classifyBlock(null, "Team Meeting", false)).toBe("internal");
    expect(classifyBlock(null, "Registration / Tech Checks", false)).toBe("registration");
    expect(classifyBlock(null, "Re-pitch: sales session", false)).toBe("sales");
  });
});

describe("PAG model", () => {
  it("orders days by the source's own day number and never leaks blocks across days", () => {
    const model = pagModel([
      field("c3", "date", "Day 3 – October 21"), field("c3", "start_time", "9:00 AM"), field("c3", "title", "Day 3 Crew Call"),
      field("c1", "date", "Day 1 – October 19"), field("c1", "start_time", "9:00 AM"), field("c1", "title", "Day 1 Crew Call"),
      field("c2", "date", "Day 2 – October 20"), field("c2", "start_time", "9:00 AM"), field("c2", "title", "Day 2 Crew Call"),
      field("x", "start_time", "10:00 AM"), field("x", "title", "No day stated"),
    ], NOW);
    expect(model.days.map(day => day.dayNumber)).toEqual([1, 2, 3, null]);
    expect(model.days.slice(0, 3).map(day => day.blocks[0].title)).toEqual(["Day 1 Crew Call", "Day 2 Crew Call", "Day 3 Crew Call"]);
    expect(model.days[3].date).toBe(UNDATED_DAY);
  });

  it("merges date-string variants of one day and collapses exact duplicates only", () => {
    const model = pagModel([
      field("v1", "date", "Day 2 – October 20"), field("v1", "start_time", "9:00 AM"), field("v1", "title", "Crew Call"),
      field("v2", "date", "October 20"), field("v2", "start_time", "9:00 AM"), field("v2", "title", "Crew Call"),
      field("v3", "date", "October 20"), field("v3", "start_time", "9:00 AM"), field("v3", "title", "Different cue, same time"),
    ], NOW);
    expect(model.days).toHaveLength(1);
    expect(model.days[0].date).toBe("Day 2 – October 20");
    expect(model.days[0].blocks.map(b => b.title).sort()).toEqual(["Crew Call", "Different cue, same time"]);
  });

  it("marks conflicts red and fresh changes pink; stale changes settle; no invented titles", () => {
    const model = pagModel([
      field("x", "date", "Oct 21"), field("x", "start_time", "9:00 AM"),
      field("x", "title", "Opening", { conflict: true }),
      field("x", "speaker", "Ava", { changedAt: NOW - 1000 }),
      field("x", "additional_detail", "Old note", { changedAt: NOW - FRESH_CHANGE_MS - 1 }),
      field("y", "date", "Oct 21"), field("y", "start_time", "9:30 AM"), field("y", "audio", "Rock Music"),
    ], NOW);
    const [opening, cueOnly] = model.days[0].blocks;
    expect(opening.titleMark).toBe("conflict");
    expect(opening.speakerMark).toBe("changed");
    expect(opening.body[0].mark).toBeNull();
    expect(cueOnly.title).toBeNull();
  });
});

describe("PAG write requests", () => {
  const fields = [
    field("a", "date", "October 21"), field("a", "day", "Day 2"), field("a", "start_time", "9:00 AM"), field("a", "end_time", "10:00 AM"), field("a", "title", "Opening", { conflict: true }),
    field("a", "audio", "Walk-on Song", { changedAt: NOW - 1000 }),
    field("b", "date", "October 21"), field("b", "start_time", "10:00 AM"), field("b", "title", "Lunch Break"),
    field("c", "date", "October 21"), field("c", "title", "Untimed note"),
  ];

  it("unmerges, clears, sets wide day columns, then writes", () => {
    const requests = pagWriteRequests(7, pagModel(fields, NOW));
    expect(requests[0]).toHaveProperty("unmergeCells");
    expect(requests.filter(r => "updateDimensionProperties" in r).length).toBeGreaterThanOrEqual(3);
  });

  it("writes source day labels, aligned rail, mark colors, and red 'No time listed'", () => {
    const requests = pagWriteRequests(7, pagModel(fields, NOW));
    type Cell = { userEnteredValue?: { stringValue: string }; textFormatRuns?: Array<{ format: { foregroundColor: unknown } }>; userEnteredFormat: { backgroundColor?: unknown } };
    const matrixRequest = requests.find(request => (request.updateCells as { start?: unknown } | undefined)?.start) as { updateCells: { rows: Array<{ values: Cell[] }> } };
    const rows = matrixRequest.updateCells.rows;
    expect(rows[1].values[2].userEnteredValue?.stringValue).toBe("Day 2");
    expect(rows[1].values[3].userEnteredValue?.stringValue).toBe("Day 2 AV Cues");
    const layout = layoutPag(pagModel(fields, NOW));
    const opening = layout.placed[0].find(p => p.block.title === "Opening")!;
    expect(rows[opening.startRow].values[0].userEnteredValue?.stringValue).toBe("9:00 AM");
    const cell = rows[opening.startRow].values[2];
    expect(cell.textFormatRuns?.[0].format.foregroundColor).toEqual(RED);
    expect(cell.userEnteredFormat.backgroundColor).toEqual(FILL.session);
    const cues = rows[opening.startRow].values[3];
    expect(cues.userEnteredValue?.stringValue).toBe("Audio: Walk-on Song");
    expect(cues.textFormatRuns?.[1].format.foregroundColor).toEqual(PINK);
    const untimed = layout.placed[0].find(p => p.block.title === "Untimed note")!;
    expect(rows[untimed.startRow].values[2].userEnteredValue?.stringValue).toContain("No time listed");
  });
});

describe("playbook sheet plumbing", () => {
  it("restores template tab titles after copyTo and recognizes the PAG tab", () => {
    expect(renameCopiedTabRequests([{ sheetId: 5, title: "Copy of 1.4 PAG/ROS" }])[0]).toMatchObject({
      updateSheetProperties: { properties: { sheetId: 5, title: "1.4 PAG/ROS" } },
    });
    expect(isPagTitle("1.4  PAG/ROS")).toBe(true);
    expect(isPagTitle("1.7 Catering Manifest")).toBe(false);
  });
});
