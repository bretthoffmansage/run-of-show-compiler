import { describe, expect, it } from "vitest";
import {
  classifyBlock, FILL, FRESH_CHANGE_MS, isPagTitle, pagModel, pagWriteRequests,
  parseClockMinutes, PINK, RED, renameCopiedTabRequests,
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
    field("b", "date", "October 21"), field("b", "start_time", "10:00:00 AM"), field("b", "title", "Day 3 Opening Sequence"),
    field("c", "date", "October 22"), field("c", "start_time", "9:00:00 AM"), field("c", "title", "Crew Call"), field("c", "type", "Team Meeting"),
    field("loose", "title", "Sponsor shoutout"),
  ];

  it("groups blocks into day columns ordered chronologically, untimed listed separately", () => {
    const model = pagModel(fields, NOW);
    expect(model.days.map(day => day.date)).toEqual(["October 21", "October 22"]);
    expect(model.days[0].blocks.map(block => block.title)).toEqual(["VIP and General Networking Open", "Day 3 Opening Sequence"]);
    expect(model.days[1].blocks[0].type).toBe("internal");
    expect(model.untimed.map(block => block.title)).toEqual(["Sponsor shoutout"]);
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
});

describe("PAG write requests", () => {
  const fields = [
    field("a", "date", "October 21"), field("a", "start_time", "9:00 AM"), field("a", "end_time", "10:00 AM"), field("a", "title", "Opening", { conflict: true }),
    field("a", "audio", "Walk-on Song", { changedAt: NOW - 1000 }),
    field("b", "date", "October 21"), field("b", "start_time", "10:00 AM"), field("b", "title", "Lunch Break"),
  ];

  it("unmerges and clears before writing, then merges blocks over their span", () => {
    const requests = pagWriteRequests(7, pagModel(fields, NOW));
    expect(requests[0]).toHaveProperty("unmergeCells");
    expect(requests[1].updateCells).toMatchObject({ range: { sheetId: 7 } });
    expect(requests[2].updateCells).toMatchObject({ start: { sheetId: 7, rowIndex: 0, columnIndex: 0 } });
    const merges = requests.filter(request => "mergeCells" in request);
    // Date header merge + the Opening block (9:00→10:00 spans one rail row, so
    // no block merge needed here) — at minimum the date header merges.
    expect(merges.length).toBeGreaterThanOrEqual(1);
  });

  it("writes day bands horizontally and block text with mark colors", () => {
    const requests = pagWriteRequests(7, pagModel(fields, NOW));
    type Cell = { userEnteredValue: { stringValue: string }; textFormatRuns: Array<{ format: { foregroundColor: unknown } }>; userEnteredFormat: { backgroundColor: unknown } };
    const rows = (requests[2].updateCells as { rows: Array<{ values: Cell[] }> }).rows;
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
