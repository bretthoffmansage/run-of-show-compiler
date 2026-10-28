import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AccessGate } from "../app/components/AccessGate";

describe("operator access gate", () => {
  it("does not expose a workspace before access", () => {
    const html = renderToStaticMarkup(<AccessGate />);
    expect(html).toContain("Run of Show Compiler");
    expect(html).toContain("Access code");
    expect(html).not.toContain("No master revision");
  });
});
