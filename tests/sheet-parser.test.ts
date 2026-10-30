import { describe, expect, it } from "vitest";
import { parseSheetDump } from "../lib/sheet-parser";
import { layoutPag, pagModel, type CompiledField } from "../lib/playbook-writer";
import { entryKeyFor, uniqueEntryKeys } from "../lib/entry-key";

// Shaped like the BMC45 master run of show: one tab per day, a caption line,
// a header row, then one row per cue. Day 3's tab comes first in the workbook.
const HEADER = "Eastern Start Time\tPacific Start Time\tEnd Time\tDuration\tStage Content\tPresenter\tVisual\tAudio\tChat Status";
const BMC = [
  "# Day 3 - October 21",
  "BMC45 Master Run of Show - Day 3",
  HEADER,
  "8:30:00 AM\t\t\t\t\t\t\t\tCREW CALL TIME",
  "9:00:00 AM\t\t9:45:00 AM\t\tVIP and General Networking Open",
  "9:40:00 AM\t6:00 AM\t10:00:00 AM\t0:20:00\tMorning All Days Roll In\t\tDay 3 Morning Roll In\t\tChat Open",
  "10:00:00 AM\t\t10:01:57 AM\t0:01:57\tEvent Opener",
  "10:01:57 AM\t7:00 AM\t10:09:57 AM\t0:08:00\tMorning Engagement\tDarami\t\t\tChat Open",
  "\t\t\t\tLove Form Break (8 min)\t\t\tRock Music for Love Form Break",
  "",
  "# Day 2 - October 20",
  "BMC45 Master Run of Show - Day 2",
  HEADER,
  "8:30:00 AM\t\t\t\t\t\t\t\tCREW CALL TIME",
  "9:40:00 AM\t6:00 AM\t10:00:00 AM\t0:20:00\tMorning All Days Roll In\t\tDay 2 Morning Roll In\t\tChat Open",
  "10:00:00 AM\t\t10:03:00 AM\t0:03:00\tDay 2 Opening Sequence",
].join("\n");

function compiled(content: string): CompiledField[] {
  const { items } = parseSheetDump(content, "src", "rev");
  const keys = uniqueEntryKeys(items.map(item => entryKeyFor(item.fields)));
  return items.flatMap((item, i) => item.fields.map(f => ({ entryKey: keys[i], fieldKey: f.key, value: f.value })));
}

describe("deterministic spreadsheet reader", () => {
  it("turns every non-empty row into an item, verbatim, with its tab's day", () => {
    const { items, unparsedText } = parseSheetDump(BMC, "src", "rev");
    expect(unparsedText).toBe("");
    expect(items).toHaveLength(9); // 6 rows on Day 3 + 3 on Day 2, nothing dropped
    const titles = items.map(item => item.fields.find(f => f.key === "title")?.value);
    expect(titles).toContain("CREW CALL TIME");
    expect(titles).toContain("VIP and General Networking Open");
    expect(titles).toContain("Morning All Days Roll In");
    for (const item of items) expect(item.fields.find(f => f.key === "date")?.value).toMatch(/^Day [23] - October 2[01]$/);
  });

  it("copies times exactly and routes every other cell under its own column name", () => {
    const { items } = parseSheetDump(BMC, "src", "rev");
    const rollIn = items.find(item => item.fields.some(f => f.value.includes("Day 3 Morning Roll In")))!;
    const get = (key: string) => rollIn.fields.find(f => f.key === key)?.value;
    expect(get("start_time")).toBe("9:40:00 AM");
    expect(get("end_time")).toBe("10:00:00 AM");
    expect(get("duration")).toBe("0:20:00");
    expect(get("production_note")).toBe("Visual: Day 3 Morning Roll In");
    expect(get("additional_detail")).toBe("Pacific Start Time: 6:00 AM\nChat Status: Chat Open");
  });

  it("keeps untimed rows (no dropping) and the caption as the day label", () => {
    const { items } = parseSheetDump(BMC, "src", "rev");
    const love = items.find(item => item.fields.some(f => f.value === "Love Form Break (8 min)"))!;
    expect(love.fields.some(f => f.key === "start_time")).toBe(false);
    expect(love.fields.find(f => f.key === "day")?.value).toBe("BMC45 Master Run of Show - Day 3");
    expect(love.fields.find(f => f.key === "production_note")?.value).toBe("Audio: Rock Music for Love Form Break");
  });

  it("hands header-less tabs to the model instead of guessing", () => {
    const { items, unparsedText } = parseSheetDump("# Notes\nCall the venue\nConfirm catering", "src", "rev");
    expect(items).toHaveLength(0);
    expect(unparsedText).toContain("Call the venue");
  });
});

describe("PAG from the reader: days, order, aligned rail", () => {
  it("puts Day 2 left of Day 3 with every row in its own day, in source order", () => {
    const model = pagModel(compiled(BMC), Date.now());
    expect(model.days.map(day => day.dayNumber)).toEqual([2, 3]);
    expect(model.days[0].blocks.map(b => b.title)).toEqual(["CREW CALL TIME", "Morning All Days Roll In", "Day 2 Opening Sequence"]);
    expect(model.days[1].blocks.map(b => b.title)).toEqual([
      "CREW CALL TIME", "VIP and General Networking Open", "Morning All Days Roll In",
      "Event Opener", "Morning Engagement", "Love Form Break (8 min)",
    ]);
    expect(model.days[1].caption).toBe("BMC45 Master Run of Show - Day 3");
  });

  it("aligns the rail: each row's label is exactly the start time of the blocks on it", () => {
    const layout = layoutPag(pagModel(compiled(BMC), Date.now()));
    for (const day of layout.placed) {
      for (const { block, startRow } of day) {
        const row = layout.rows[startRow - 2];
        if (block.timeText) expect(row.startLabel).toBe(block.timeText.split(" - ")[0]);
      }
      // No two blocks of a day overlap.
      for (let i = 1; i < day.length; i++) expect(day[i].startRow).toBeGreaterThanOrEqual(day[i - 1].endRow);
    }
    // The untimed row sits right under the row above it, not at the bottom.
    const day3 = layout.placed[1];
    const love = day3.find(p => p.block.title === "Love Form Break (8 min)")!;
    const engagement = day3.find(p => p.block.title === "Morning Engagement")!;
    expect(love.startRow).toBe(engagement.endRow);
  });
});
