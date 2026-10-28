import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppShell } from "../app/components/AppShell";

describe("authenticated app shell", () => {
  it("keeps organization/event context and local status visible", () => {
    const html = renderToStaticMarkup(<AppShell organizationName="SAGE" eventName="Summit" organizationId="org" eventId="event"><main>Workflow controls</main></AppShell>);
    expect(html).toContain("SAGE");
    expect(html).toContain("Summit");
    expect(html).toContain("Event workspace");
    expect(html).toContain("No Google or AI connection");
    expect(html).toContain("Workflow controls");
  });
});
