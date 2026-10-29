import { describe, expect, it } from "vitest";
import { CLEAR_COLS, CLEAR_ROWS, FRESH_CHANGE_MS, isPagTitle, pagGridRows, pagPlan, pagWriteRequests, PINK, RED, renameCopiedTabRequests } from "../lib/playbook-writer";

const NOW = 1_800_000_000_000;

const field = (entryKey: string, fieldKey: string, value: string, extra: { conflict?: boolean; changedAt?: number } = {}) =>
  ({ entryKey, fieldKey, value, ...extra });

describe("playbook PAG plan", () => {
  it("groups entries into day columns, sorts by time, and buckets undated entries last", () => {
    const plan = pagPlan([
      field("b", "date", "2026-11-04"), field("b", "start_time", "09:00"), field("b", "title", "Day 2 Open"),
      field("a", "date", "2026-11-03"), field("a", "start_time", "10:00"), field("a", "title", "Keynote"),
      field("a2", "date", "2026-11-03"), field("a2", "start_time", "09:00"), field("a2", "title", "Opening"),
      field("loose", "title", "Sponsor shoutout"),
    ], NOW);
    expect(plan.days).toEqual(["2026-11-03", "2026-11-04"]);
    expect(plan.hasUndated).toBe(true);
    expect(plan.byDay[0].map(entry => entry.title)).toEqual(["Opening", "Keynote"]);
    expect(plan.byDay[1].map(entry => entry.title)).toEqual(["Day 2 Open"]);
    expect(plan.byDay[2].map(entry => entry.title)).toEqual(["Sponsor shoutout"]);
    // Untimed entries are themselves an unknown: the time renders red.
    expect(plan.byDay[2][0].untimed).toBe(true);
    expect(plan.byDay[2][0].timeMark).toBe("conflict");
  });

  it("marks conflicts red and fresh changes pink, and lets stale changes settle", () => {
    const plan = pagPlan([
      field("x", "start_time", "09:00"), field("x", "date", "2026-11-03"),
      field("x", "title", "Opening", { conflict: true }),
      field("x", "speaker", "Ava", { changedAt: NOW - 1000 }),
      field("x", "end_time", "09:30", { changedAt: NOW - FRESH_CHANGE_MS - 1 }),
    ], NOW);
    const entry = plan.byDay[0][0];
    expect(entry.titleMark).toBe("conflict");
    expect(entry.speakerMark).toBe("changed");
    // end_time changed longer ago than the freshness window: no mark.
    expect(entry.timeMark).toBeNull();
  });

  it("renders grid rows whose text runs carry the mark colors", () => {
    const rows = pagGridRows(pagPlan([
      field("x", "date", "2026-11-03"), field("x", "start_time", "09:00"),
      field("x", "title", "Opening", { conflict: true }),
      field("x", "speaker", "Ava", { changedAt: NOW - 1000 }),
    ], NOW));
    expect(rows[0][1]).toMatchObject({ userEnteredValue: { stringValue: "2026-11-03" } });
    const body = rows[1][1] as { userEnteredValue: { stringValue: string }; textFormatRuns: Array<{ format: { foregroundColor: unknown } }> };
    expect(body.userEnteredValue.stringValue).toBe("Opening\n09:00\nAva");
    expect(body.textFormatRuns[0].format.foregroundColor).toEqual(RED);
    expect(body.textFormatRuns[2].format.foregroundColor).toEqual(PINK);
  });

  it("builds a clear-then-write batch so removed entries do not linger", () => {
    const requests = pagWriteRequests(77, pagPlan([field("x", "title", "Solo")], NOW));
    expect(requests).toHaveLength(2);
    expect(requests[0].updateCells).toMatchObject({ range: { sheetId: 77, endRowIndex: CLEAR_ROWS, endColumnIndex: CLEAR_COLS } });
    expect(requests[1].updateCells).toMatchObject({ start: { sheetId: 77, rowIndex: 0, columnIndex: 0 } });
  });
});

describe("playbook sheet plumbing", () => {
  it("restores template tab titles after copyTo and recognizes the PAG tab", () => {
    expect(renameCopiedTabRequests([{ sheetId: 5, title: "Copy of 1.4 PAG/ROS" }])[0]).toMatchObject({
      updateSheetProperties: { properties: { sheetId: 5, title: "1.4 PAG/ROS" } },
    });
    expect(isPagTitle("1.4 PAG/ROS")).toBe(true);
    expect(isPagTitle("Copy of 1.4 PAG/ROS")).toBe(true);
    expect(isPagTitle("1.7 Catering Manifest")).toBe(false);
  });
});
