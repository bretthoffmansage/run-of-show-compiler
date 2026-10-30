import { describe, expect, it } from "vitest";
import {
  classifyBlock, FILL, FRESH_CHANGE_MS, isPagTitle, pagModel, pagWriteRequests,
  parseClockMinutes, PINK, placeDayBlocks, RED, renameCopiedTabRequests,
} from "../lib/playbook-writer";

const NOW = 1_800_000_000_000;

const field = (entryKey: string, fieldKey: string, value: string, extra: { conflict?: boolean; changedAt?: number } = {}) =>
  ({ entryKey, fieldKey, value, ...extra });

describe("time parsing (ordering only — display stays as written)", () => {
  it("parses the formats client sheets actually use", () => {
    expect(parseClockMinutes("9:40:00 AM")).toBe(9 * 60 + 40);
    expect(parseClockMinutes("10:00 AM")).toBe(600);
    expect(parseClockMinutes("1:00pm")).toBe(13 * 60);
    expect(parseClockMinutes("14:30")).toBe(14 * 60 + 30);
    // Bare small hours read as afternoon on an event day.
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
    expect(classifyBlock(null, "Anything", true)).toBe("transition");
    expect(classifyBlock(null, "Team Meeting", false)).toBe("internal");
    expect(classifyBlock(null, "Host & Emcee Sound Test", false)).toBe("internal");
    expect(classifyBlock(null, "Registration / Tech Checks", false)).toBe("registration");
    expect(classifyBlock(null, "Re-pitch: sales session", false)).toBe("sales");
  });
});

describe("PAG model: days horizontal, time flowing downward", () => {
  const fields = [
    field("a", "date", "October 21"), field("a", "start_time", "9:00:00 AM"), field("a", "end_time", "9:45:00 AM"), field("a", "title", "VIP and General Networking Open"),
    field("b", "date", "October 21"), field("b", "start_time", "10:00:00 AM"), field("b", "title", "Day 2 Opening Sequence"),
    field("c", "date", "October 22"), field("c", "start_time", "9:00:00 AM"), field("c", "title", "Crew Call"), field("c", "type", "Team Meeting"),
    field("loose", "title", "Sponsor shoutout"),
  ];

  it("groups blocks into day columns ordered chronologically, unplaced listed separately", () => {
    const model = pagModel(fields, NOW);
    expect(model.days.map(day => day.date)).toEqual(["October 21", "October 22"]);
    expect(model.days[0].blocks.map(block => block.title)).toEqual(["VIP and General Networking Open", "Day 2 Opening Sequence"]);
    expect(model.days[1].blocks[0].type).toBe("internal");
    expect(model.unplaced.map(block => block.title)).toEqual(["Sponsor shoutout"]);
  });

  it("merges day variants into one column and collapses duplicate blocks", () => {
    // The same day written two ways across extraction chunks must not make
    // two columns, and the same row captured twice keeps only the richer copy.
    const model = pagModel([
      field("v1", "date", "Day 2 – October 20"), field("v1", "day", "Day 2"), field("v1", "start_time", "9:00 AM"), field("v1", "title", "Crew Call"),
      field("v2", "date", "October 20"), field("v2", "start_time", "9:00 AM"), field("v2", "title", "Crew Call!"), field("v2", "speaker", "DH"),
      field("v3", "date", "October 20"), field("v3", "start_time", "10:00 AM"), field("v3", "title", "Doors"),
    ], NOW);
    expect(model.days).toHaveLength(1);
    expect(model.days[0].date).toBe("Day 2 – October 20");
    expect(model.days[0].dayNumber).toBe(2);
    expect(model.days[0].blocks.map(block => block.title)).toEqual(["Crew Call!", "Doors"]);
    expect(model.days[0].blocks[0].speaker).toBe("DH");
  });

  it("orders days by the source's own day number and never leaks blocks across days", () => {
    // Day 3's tab appears FIRST in the source (as BMC45 does) — it must still
    // land far right, and a dated-but-dayless block stays in its own date column.
    const model = pagModel([
      field("c3", "date", "Day 3 – October 21"), field("c3", "day", "Day 3"), field("c3", "start_time", "9:00 AM"), field("c3", "title", "Day 3 Crew Call"),
      field("c1", "date", "Day 1 – October 19"), field("c1", "day", "Day 1"), field("c1", "start_time", "9:00 AM"), field("c1", "title", "Day 1 Crew Call"),
      field("c2", "date", "Day 2 – October 20"), field("c2", "day", "Day 2"), field("c2", "start_time", "9:00 AM"), field("c2", "title", "Day 2 Crew Call"),
      field("x", "start_time", "10:00 AM"), field("x", "title", "No day stated"),
    ], NOW);
    expect(model.days.map(day => day.dayNumber)).toEqual([1, 2, 3]);
    expect(model.days.map(day => day.blocks[0].title)).toEqual(["Day 1 Crew Call", "Day 2 Crew Call", "Day 3 Crew Call"]);
    // Timed but dayless: unplaced, not dumped into Day 1's column.
    expect(model.unplaced.map(block => block.title)).toEqual(["No day stated"]);
    expect(model.days.every(day => day.blocks.every(block => block.title.startsWith(`Day ${day.dayNumber}`)))).toBe(true);
  });

  it("builds a shared time rail from boundaries, labeled exactly as written", () => {
    const model = pagModel(fields, NOW);
    expect(model.rail.map(stop => stop.minute)).toEqual([540, 585, 600]);
    expect(model.rail[0].label).toBe("9:00:00 AM");
    expect(model.rail[1].label).toBe("9:45:00 AM");
  });

  it("keeps time text verbatim — no timezone conversion, no reformatting", () => {
    const model = pagModel(fields, NOW);
    expect(model.days[0].blocks[0].timeText).toBe("9:00:00 AM - 9:45:00 AM");
    expect(model.days[0].blocks[1].timeText).toBe("10:00:00 AM");
  });

  it("marks conflicts red and fresh changes pink; stale changes settle", () => {
    const model = pagModel([
      field("x", "date", "Oct 21"), field("x", "start_time", "9:00 AM"),
      field("x", "title", "Opening", { conflict: true }),
      field("x", "speaker", "Ava", { changedAt: NOW - 1000 }),
      field("x", "additional_detail", "Old note", { changedAt: NOW - FRESH_CHANGE_MS - 1 }),
    ], NOW);
    const block = model.days[0].blocks[0];
    expect(block.titleMark).toBe("conflict");
    expect(block.speakerMark).toBe("changed");
    expect(block.body[0].mark).toBeNull();
  });

  it("routes production fields into the paired AV cues data", () => {
    const model = pagModel([
      field("x", "date", "Oct 21"), field("x", "start_time", "9:00 AM"), field("x", "title", "Opening"),
      field("x", "audio", "Walk-on Song"), field("x", "slides", "Day 1 Slidedeck"),
    ], NOW);
    expect(model.days[0].blocks[0].av).toEqual([
      { label: "Audio", text: "Walk-on Song", mark: null },
      { label: "Slides", text: "Day 1 Slidedeck", mark: null },
    ]);
  });

  it("carries every remaining captured field as labeled block facts", () => {
    const model = pagModel([
      field("x", "date", "Oct 21"), field("x", "start_time", "9:00 AM"), field("x", "title", "Opening"),
      field("x", "duration", "0:20:00"), field("x", "audience", "VIP"), field("x", "dependency", "After tech check"),
    ], NOW);
    expect(model.days[0].blocks[0].meta).toEqual([
      { label: "Duration", text: "0:20:00", mark: null },
      { label: "Audience", text: "VIP", mark: null },
      { label: "Depends on", text: "After tech check", mark: null },
    ]);
  });
});

describe("downward placement never overlaps", () => {
  it("stacks same-start and second-resolution blocks sequentially", () => {
    const model = pagModel([
      field("a", "date", "Oct 21"), field("a", "start_time", "10:00:00 AM"), field("a", "end_time", "10:01:57 AM"), field("a", "title", "Event Opener"),
      field("b", "date", "Oct 21"), field("b", "start_time", "10:00:00 AM"), field("b", "title", "Day 3 Opening Sequence"),
      field("c", "date", "Oct 21"), field("c", "start_time", "10:01:57 AM"), field("c", "title", "Morning Engagement"),
    ], NOW);
    const minuteToRow = new Map<number, number>();
    model.rail.forEach((stop, index) => minuteToRow.set(stop.minute, 2 + index));
    const placements = placeDayBlocks(model.days[0], minuteToRow);
    for (let i = 1; i < placements.length; i++) {
      expect(placements[i].startRow).toBeGreaterThanOrEqual(placements[i - 1].endRow);
    }
    expect(placements.every(p => p.endRow > p.startRow)).toBe(true);
  });
});

describe("PAG write requests", () => {
  const fields = [
    field("a", "date", "October 21"), field("a", "start_time", "9:00 AM"), field("a", "end_time", "10:00 AM"), field("a", "title", "Opening", { conflict: true }),
    field("a", "audio", "Walk-on Song", { changedAt: NOW - 1000 }),
    field("b", "date", "October 21"), field("b", "start_time", "10:00 AM"), field("b", "title", "Lunch Break"),
  ];

  it("unmerges, clears, and sets wide day columns before writing", () => {
    const requests = pagWriteRequests(7, pagModel(fields, NOW));
    expect(requests[0]).toHaveProperty("unmergeCells");
    expect(requests[1].updateCells).toMatchObject({ range: { sheetId: 7 } });
    const widths = requests.filter(request => "updateDimensionProperties" in request);
    expect(widths.length).toBeGreaterThanOrEqual(3); // rail + day + cues columns
    expect(widths[1]).toMatchObject({ updateDimensionProperties: { properties: { pixelSize: 380 } } });
    const merges = requests.filter(request => "mergeCells" in request);
    expect(merges.length).toBeGreaterThanOrEqual(1); // at minimum the date header
  });

  it("writes day bands horizontally and block text with mark colors", () => {
    const requests = pagWriteRequests(7, pagModel(fields, NOW));
    type Cell = { userEnteredValue: { stringValue: string }; textFormatRuns: Array<{ format: { foregroundColor: unknown } }>; userEnteredFormat: { backgroundColor: unknown } };
    const matrixRequest = requests.find(request => (request.updateCells as { start?: unknown } | undefined)?.start) as { updateCells: { rows: Array<{ values: Cell[] }> } };
    const rows = matrixRequest.updateCells.rows;
    expect(rows[0].values[2].userEnteredValue.stringValue).toBe("October 21");
    expect(rows[1].values[2].userEnteredValue.stringValue).toBe("Day 1");
    expect(rows[1].values[3].userEnteredValue.stringValue).toBe("Day 1 AV Cues");
    const opening = rows[2].values[2];
    expect(opening.userEnteredValue.stringValue).toContain("Opening");
    expect(opening.textFormatRuns[0].format.foregroundColor).toEqual(RED);
    expect(opening.userEnteredFormat.backgroundColor).toEqual(FILL.session);
    const cues = rows[2].values[3];
    expect(cues.userEnteredValue.stringValue).toBe("Audio: Walk-on Song");
    expect(cues.textFormatRuns[1].format.foregroundColor).toEqual(PINK);
    const lunch = rows[3].values[2];
    expect(lunch.userEnteredFormat.backgroundColor).toEqual(FILL.transition);
  });
});

describe("playbook sheet plumbing", () => {
  it("restores template tab titles after copyTo and recognizes the PAG tab", () => {
    expect(renameCopiedTabRequests([{ sheetId: 5, title: "Copy of 1.4 PAG/ROS" }])[0]).toMatchObject({
      updateSheetProperties: { properties: { sheetId: 5, title: "1.4 PAG/ROS" } },
    });
    expect(isPagTitle("1.4 PAG/ROS")).toBe(true);
    expect(isPagTitle("1.7 Catering Manifest")).toBe(false);
  });
});
