import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Home from "../app/page";

describe("foundation workspace", () => {
  it("renders an honest setup-stage shell without fabricated event data", () => {
    const html = renderToStaticMarkup(<Home />);
    expect(html).toContain("Run of Show Compiler");
    expect(html).toContain("No sources connected");
    expect(html).toContain("No master revision");
    expect(html).toContain("No live connections");
    expect(html).toContain("not implemented");
  });
});
