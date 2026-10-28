import { describe, expect, it } from "vitest";
import { parseConvexId } from "../lib/convex-id";

describe("route/form ID shape guard", () => {
  it("accepts plausible IDs and rejects path/control payloads before backend validation", () => {
    expect(parseConvexId<"events">("j572m1jcqwnzjhyxeaj2qa11618h5zwn")).toBeTruthy();
    for (const input of [null, 12, "", "../other-event", "bad/id", "abc", "a".repeat(129), "x\nHeader: injected"]) {
      expect(parseConvexId(input)).toBeNull();
    }
  });
});
