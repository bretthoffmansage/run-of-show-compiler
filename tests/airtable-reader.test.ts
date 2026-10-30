import { describe, expect, it } from "vitest";
import { AirtableReadError, dayFieldOf, parseAirtableUrl, readAirtableSource, type Fetcher } from "../lib/airtable-reader";
import { parseSheetDump } from "../lib/sheet-parser";
import { pagModel, type CompiledField } from "../lib/playbook-writer";
import { entryKeyFor, uniqueEntryKeys } from "../lib/entry-key";

const BASE = "appAbCdEfGhIjKlMn";
const TABLE = "tblAbCdEfGhIjKlMn";
const VIEW = "viwAbCdEfGhIjKlMn";
const URL_ = `https://airtable.com/${BASE}/${TABLE}/${VIEW}?blocks=hide`;

// Shaped like the "Summit 2026" Airtable in Brett's mockup: grouped by Day.
const SCHEMA = { tables: [{ id: TABLE, name: "Summit 2026", fields: [{ name: "Official Title" }, { name: "Speaker" }, { name: "Audience" }, { name: "Day" }, { name: "Start Time" }], views: [{ id: VIEW, name: "Grouped by Day" }] }] };
const rec = (title: string, speaker: string, audience: string, day: string, start?: string) => ({ id: "rec", fields: { "Official Title": title, Speaker: speaker, Audience: audience, Day: day, ...(start ? { "Start Time": start } : {}) } });
const PAGE_1 = { records: [
  rec("Welcome by the Host", "Kaitlin O'Toole", "General", "Day 1: Your Voice Has Power — Claim It", "10/21/2026 9:00am"),
  rec("You Were Born to Lead With Your Voice", "Eric Edmeades", "General", "Day 1: Your Voice Has Power — Claim It", "10/21/2026 9:15am"),
], offset: "next" };
const PAGE_2 = { records: [
  rec("VIP-Only Q&A with Eric", "Eric Edmeades", "VIP", "Day 1: Your Voice Has Power — Claim It"),
  rec("Opening by Host", "Kaitlin O'Toole", "General", "Day 2: Your Story Is Your Currency", "10/22/2026 9:00am"),
] };

function mock(calls: string[]): Fetcher {
  return async (url) => {
    calls.push(url);
    const body = url.includes("/meta/bases/") ? SCHEMA : url.includes("offset=next") ? PAGE_2 : PAGE_1;
    return new Response(JSON.stringify(body), { status: 200 });
  };
}

describe("Airtable links", () => {
  it("parses base/table/view links and rejects others", () => {
    expect(parseAirtableUrl(URL_)).toMatchObject({ baseId: BASE, tableId: TABLE, viewId: VIEW });
    expect(parseAirtableUrl(`https://airtable.com/${BASE}/${TABLE}`)).toMatchObject({ viewId: null });
    expect(parseAirtableUrl(`https://airtable.com/${BASE}`)).toBeNull();
    expect(parseAirtableUrl(`https://airtable.com.evil.test/${BASE}/${TABLE}`)).toBeNull();
  });

  it("finds the day field", () => {
    expect(dayFieldOf(["Official Title", "Day", "Speaker"])).toBe("Day");
    expect(dayFieldOf(["Title", "Event Day"])).toBe("Event Day");
    expect(dayFieldOf(["Title", "Speaker"])).toBeNull();
  });
});

describe("live Airtable read", () => {
  it("reads every page in view order, grouped into one tab per day", async () => {
    const calls: string[] = [];
    const read = await readAirtableSource({ url: URL_, token: "patTEST", fetcher: mock(calls) });
    expect(calls.some(c => c.includes(`view=${VIEW}`) && c.includes("cellFormat=string"))).toBe(true);
    expect(read.recordCount).toBe(4);
    expect(read.text).toContain("# Day 1: Your Voice Has Power — Claim It\n## Official Title\tSpeaker\tAudience\tStart Time");
    expect(read.text).toContain("# Day 2: Your Story Is Your Currency");
    expect(read.revision).toMatch(/^airtable:[0-9a-f]{24}$/);
    // Same data → same revision (no new snapshot); changed data → new revision.
    const again = await readAirtableSource({ url: URL_, token: "patTEST", fetcher: mock([]) });
    expect(again.revision).toBe(read.revision);
  });

  it("classifies auth and access failures", async () => {
    for (const [status, code] of [[401, "needs_token"], [403, "no_access"], [404, "no_access"], [429, "rate_limited"]] as const) {
      const fetcher: Fetcher = async () => new Response("{}", { status });
      await expect(readAirtableSource({ url: URL_, token: "patTEST", fetcher })).rejects.toMatchObject({ code });
    }
    await expect(readAirtableSource({ url: "https://example.com", token: "patTEST", fetcher: mock([]) })).rejects.toBeInstanceOf(AirtableReadError);
  });

  it("flows through the exact reader into day columns with every record", async () => {
    const read = await readAirtableSource({ url: URL_, token: "patTEST", fetcher: mock([]) });
    const { items, unparsedText } = parseSheetDump(read.text, "src", read.revision);
    expect(unparsedText).toBe("");
    expect(items).toHaveLength(4);
    const keys = uniqueEntryKeys(items.map(item => entryKeyFor(item.fields)));
    const fields: CompiledField[] = items.flatMap((item, i) => item.fields.map(f => ({ entryKey: keys[i], fieldKey: f.key, value: f.value })));
    const model = pagModel(fields, Date.now());
    expect(model.days.map(d => d.dayNumber)).toEqual([1, 2]);
    expect(model.days[0].blocks.map(b => b.title)).toEqual(["Welcome by the Host", "You Were Born to Lead With Your Voice", "VIP-Only Q&A with Eric"]);
    expect(model.days[0].blocks[0].speaker).toBe("Kaitlin O'Toole");
    expect(model.days[0].blocks[0].timeText).toBe("10/21/2026 9:00am");
    expect(model.days[0].blocks[0].startMin).toBe(9 * 60);
    // The untimed VIP row is kept, and will show the red "No time listed".
    expect(model.days[0].blocks[2].timeText).toBeNull();
  });
});
