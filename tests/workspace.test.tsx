import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompiledEntries, SourcePane, type WorkspaceEntry, type WorkspaceSource } from "../app/components/Workspace";

function source(overrides: Partial<WorkspaceSource>): WorkspaceSource {
  return {
    id: "source-1", eventId: "event-1", name: "Agenda", provider: "google_docs", state: "connected",
    lastCheckedAt: Date.now(), lastSyncAt: Date.now(), lastRevision: "drive:12", lastError: null,
    preview: "09:00 Opening", originalUrl: "https://docs.google.com/document/d/abc/edit",
    ...overrides,
  };
}

const entry: WorkspaceEntry = {
  id: "entry-1", date: "2026-11-03", time: "09:00", title: "Opening", speaker: "Ava Chen",
  sourceName: "Agenda", sourceRevision: "r1", changeState: "conflict", titleMark: "conflict", details: "Host welcome",
  extras: [{ key: "production_note", value: "Cue walk-in music" }],
};

describe("source pane (client document viewer)", () => {
  it("renders tabs, status, and the document EMBED by default for live sources", () => {
    const html = renderToStaticMarkup(<SourcePane sources={[source({})]} />);
    expect(html).toContain("Live · synced");
    expect(html).toContain("Rev drive:12");
    // The client's document renders as a live embed, not extracted text.
    expect(html).toContain("<iframe");
    expect(html).toContain("https://docs.google.com/document/d/abc/preview");
    expect(html).not.toContain("09:00 Opening");
    // The text view stays available as a toggle.
    expect(html).toContain("Document");
    expect(html).toContain("Text");
  });

  it("labels broken and stale sources with actionable status text", () => {
    const stale = renderToStaticMarkup(<SourcePane sources={[source({ lastCheckedAt: Date.now() - 30 * 60_000 })]} />);
    expect(stale).toContain("Live · possibly stale");
    const broken = renderToStaticMarkup(<SourcePane sources={[source({ state: "needs_reauthorization" })]} />);
    expect(broken).toContain("reconnect it in Settings");
    const office = renderToStaticMarkup(<SourcePane sources={[source({ state: "error", lastError: "office_file" })]} />);
    expect(office).toContain("Save as Google Sheets");
  });

  it("refuses unsafe original URLs for both the link and the embed", () => {
    const html = renderToStaticMarkup(<SourcePane sources={[source({ originalUrl: "javascript:alert(1)" })]} />);
    expect(html).not.toContain("javascript:alert(1)");
    expect(html).not.toContain("<iframe");
  });

  it("shows manual sources as text with no embed or toggle", () => {
    const html = renderToStaticMarkup(<SourcePane sources={[source({ id: "manual", name: "Notes", provider: "manual", state: "static", originalUrl: null, preview: "Opening" })]} />);
    expect(html).toContain("Static · manual input");
    expect(html).toContain("Opening");
    expect(html).not.toContain("<iframe");
  });
});

describe("compiled run of show list", () => {
  it("marks conflicts red at the field level and never blocks on them", () => {
    const html = renderToStaticMarkup(<CompiledEntries entries={[entry]} />);
    expect(html).toContain("2026-11-03");
    expect(html).toContain("09:00");
    expect(html).toContain("Ava Chen");
    expect(html).toContain("Revision r1");
    expect(html).toContain("sources disagree");
    expect(html).toContain("text-conflict");
    expect(html).not.toContain("Approve");
  });

  it("renders the zero-state invitation when nothing compiled", () => {
    const html = renderToStaticMarkup(<CompiledEntries entries={[]} />);
    expect(html).toContain("Nothing compiled yet");
    expect(html).toContain("no approvals, no buttons");
  });
});
