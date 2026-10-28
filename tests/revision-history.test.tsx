import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Doc } from "../convex/_generated/dataModel";
import { RevisionHistory } from "../app/components/RevisionHistory";

describe("read-only revision history", () => {
  it("shows decisions, actors, timestamps and prior approved fields", () => {
    const proposals = [{ _id: "proposal", fieldKey: "title", proposedValue: "Opening" }] as Doc<"masterProposals">[];
    const decisions = [{ _id: "decision", proposalId: "proposal", kind: "approve", at: Date.UTC(2026, 9, 28), actor: "operator" }] as Doc<"masterDecisions">[];
    const revisions = [{ _id: "revision", number: 1, createdAt: Date.UTC(2026, 9, 28), approvedBy: "operator", fields: [{ entryKey: "opening", fieldKey: "title", value: "Opening", origin: "source" }] }] as Doc<"masterRevisions">[];
    const html = renderToStaticMarkup(<RevisionHistory proposals={proposals} decisions={decisions} revisions={revisions} />);
    expect(html).toContain("Change history");
    expect(html).toContain("Revision 1");
    expect(html).toContain("operator");
    expect(html).toContain("2026-10-28");
    expect(html).toContain("title: Opening");
  });
});
