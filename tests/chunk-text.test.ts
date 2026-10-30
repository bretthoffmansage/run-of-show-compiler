import { describe, expect, it } from "vitest";
import { chunkBySections, headerNamesDay } from "../lib/chunk-text";

describe("tab-aware chunking", () => {
  const sheet = [
    "# Day 3 – October 21",
    ...Array.from({ length: 400 }, (_, i) => `9:${String(i % 60).padStart(2, "0")}:00 AM\tDay 3 cue ${i}`),
    "",
    "# Day 2 – October 20",
    ...Array.from({ length: 400 }, (_, i) => `9:${String(i % 60).padStart(2, "0")}:00 AM\tDay 2 cue ${i}`),
  ].join("\n");

  it("never mixes tabs, and every chunk starts with its tab's header", () => {
    const chunks = chunkBySections(sheet, 3_000);
    expect(chunks.length).toBeGreaterThan(4);
    for (const chunk of chunks) {
      expect(chunk.text.startsWith(`# ${chunk.header}\n`)).toBe(true);
      const day = chunk.header!.match(/Day (\d)/)![1];
      // Every cue line in the chunk belongs to the header's day.
      for (const line of chunk.text.split("\n").slice(1).filter(Boolean)) expect(line).toContain(`Day ${day} cue`);
    }
  });

  it("covers every line exactly once", () => {
    const chunks = chunkBySections(sheet, 3_000);
    const bodyLines = chunks.flatMap(chunk => chunk.text.split("\n").slice(1)).filter(Boolean);
    expect(bodyLines).toHaveLength(800);
  });

  it("treats documents without tab headers as one section", () => {
    const chunks = chunkBySections("09:00 Opening\n09:30 Break", 28_000);
    expect(chunks).toEqual([{ header: null, text: "09:00 Opening\n09:30 Break" }]);
  });

  it("recognizes headers that name a day or a date", () => {
    expect(headerNamesDay("Day 3 – October 21")).toBe(true);
    expect(headerNamesDay("Thursday, August 14th")).toBe(true);
    expect(headerNamesDay("Oct 21")).toBe(true);
    expect(headerNamesDay("10/21")).toBe(true);
    expect(headerNamesDay("Speaker Contacts")).toBe(false);
    expect(headerNamesDay(null)).toBe(false);
  });
});
