import { describe, expect, it } from "vitest";
import { formatApprovedMasterHtml } from "../lib/master-export";

describe("approved master HTML formatter", () => {
  it("exports only a labeled approved revision with escaped values", () => {
    const html = formatApprovedMasterHtml({ status: "approved", eventName: "Summit <2026>", revisionNumber: 3, approvedBy: "alice", fields: [{ entryKey: "opening", fieldKey: "script", value: "<script>alert('x')</script>", origin: "operator" }] });
    expect(html).toContain("Approved run of show · Revision 3");
    expect(html).toContain("Summit &lt;2026&gt;");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("rejects unapproved or unversioned input", () => {
    const input = { status: "pending" as "approved", eventName: "Summit", revisionNumber: 1, approvedBy: "alice", fields: [] };
    expect(() => formatApprovedMasterHtml(input)).toThrow("Approved master revision required");
    expect(() => formatApprovedMasterHtml({ ...input, status: "approved", revisionNumber: 0 })).toThrow("Approved master revision required");
  });
});
