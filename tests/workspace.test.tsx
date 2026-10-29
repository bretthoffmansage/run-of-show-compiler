import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Workspace, type WorkspaceEntry, type WorkspaceSource } from "../app/components/Workspace";

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

describe("source and master workspace view", () => {
  it("renders separate source and master panes with provenance and status", () => {
    const html = renderToStaticMarkup(<Workspace sources={[source({})]} entries={[entry]} />);
    expect(html).toContain("Sources");
    expect(html).toContain("Master run of show");
    expect(html).toContain("Live · synced");
    expect(html).toContain("Rev drive:12");
    expect(html).toContain("Revision r1");
    expect(html).toContain("2026-11-03");
    expect(html).toContain("09:00");
    expect(html).toContain("Ava Chen");
    expect(html).toContain("Cue walk-in music");
    expect(html).toContain("sources disagree");
    expect(html).toContain("text-conflict");
    expect(html).toContain("Open original");
    expect(html).toContain("ask the client");
  });

  it("surfaces stale and error states without claiming a live sync", () => {
    const stale = renderToStaticMarkup(<Workspace sources={[source({ lastCheckedAt: Date.now() - 30 * 60_000 })]} entries={[]} />);
    expect(stale).toContain("possibly stale");
    const broken = renderToStaticMarkup(<Workspace sources={[source({ state: "needs_reauthorization" })]} entries={[]} />);
    expect(broken).toContain("reconnect it in Settings");
  });

  it("does not render unsafe source links", () => {
    const html = renderToStaticMarkup(<Workspace sources={[source({ originalUrl: "javascript:alert(1)" })]} entries={[]} />);
    expect(html).not.toContain("Open original");
    expect(html).not.toContain("javascript:");
  });

  it("labels manual sources as static rather than synced", () => {
    const html = renderToStaticMarkup(<Workspace sources={[source({ id: "manual", name: "Notes", provider: "manual", state: "static", originalUrl: null, preview: "Opening" })]} entries={[]} />);
    expect(html).toContain("Static input · no live sync");
    expect(html).not.toContain("Checked");
  });
});
