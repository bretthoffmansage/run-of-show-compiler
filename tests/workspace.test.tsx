import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Workspace } from "../app/components/Workspace";

describe("source and master workspace view", () => {
  it("renders separate source and master panes with provenance and status", () => {
    const html = renderToStaticMarkup(<Workspace
      sources={[{ id: "source-1", name: "Agenda", provider: "google_docs", state: "stale", lastSuccessfulSync: "2026-10-28", preview: "09:00 Opening", originalUrl: "https://docs.google.com/document/d/abc/edit" }]}
      entries={[{ id: "entry-1", time: "09:00", title: "Opening", sourceName: "Agenda", sourceRevision: "r1", changeState: "needs_review", details: "Host: Ava" }]}
    />);
    expect(html).toContain("Sources");
    expect(html).toContain("Master run of show");
    expect(html).toContain("stale");
    expect(html).toContain("Revision r1");
    expect(html).toContain("needs review");
    expect(html).toContain("Open original");
    expect(html).toContain("Review pending proposals in the decisions panel below");
  });

  it("does not render unsafe source links", () => {
    const html = renderToStaticMarkup(<Workspace sources={[{ id: "x", name: "Bad", provider: "google_docs", state: "not_connected", lastSuccessfulSync: null, preview: null, originalUrl: "javascript:alert(1)" }]} entries={[]} />);
    expect(html).not.toContain("Open original");
    expect(html).not.toContain("javascript:");
  });
});
