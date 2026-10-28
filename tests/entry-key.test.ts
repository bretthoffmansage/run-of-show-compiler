import { describe, expect, it } from "vitest";
import { entryKeyFor, uniqueEntryKeys } from "../lib/entry-key";
import { chunkByLines } from "../lib/chunk-text";

describe("stable entry identity", () => {
  it("derives the same key for the same logical entry across snapshots", () => {
    const a = entryKeyFor([{ key: "date", value: "2026-11-03" }, { key: "start_time", value: "09:00" }, { key: "title", value: "Opening Welcome!" }]);
    const b = entryKeyFor([{ key: "title", value: "Opening  welcome" }, { key: "start_time", value: "09:00" }, { key: "date", value: "2026-11-03" }]);
    expect(a).toBe("2026-11-03_09:00_opening-welcome");
    expect(b).toBe(a);
  });

  it("keys untimed entries without inventing times", () => {
    expect(entryKeyFor([{ key: "title", value: "Break" }])).toBe("nodate_notime_break");
  });

  it("disambiguates repeats within a batch", () => {
    expect(uniqueEntryKeys(["a", "b", "a", "a"])).toEqual(["a", "b", "a-2", "a-3"]);
  });
});

describe("chunking", () => {
  it("keeps small text whole and splits large text on line boundaries", () => {
    expect(chunkByLines("one\ntwo")).toEqual(["one\ntwo"]);
    const line = "x".repeat(1000);
    const text = Array.from({ length: 100 }, () => line).join("\n");
    const chunks = chunkByLines(text, 10_000);
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.every(chunk => new TextEncoder().encode(chunk).length <= 10_000)).toBe(true);
    expect(chunks.join("\n")).toBe(text);
    for (const chunk of chunks) expect(text.includes(chunk)).toBe(true);
  });

  it("hard-splits a pathological single line", () => {
    const chunks = chunkByLines("y".repeat(25_000), 10_000);
    expect(chunks.length).toBe(3);
    expect(chunks.join("")).toBe("y".repeat(25_000));
  });

  it("returns nothing for blank text", () => {
    expect(chunkByLines("   \n  ")).toEqual([]);
  });
});
