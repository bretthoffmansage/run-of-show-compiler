import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppShell } from "../app/components/AppShell";

describe("authenticated app shell", () => {
  it("keeps organization/event context visible without picker lists", () => {
    const html = renderToStaticMarkup(<AppShell organizationName="SAGE" eventName="Summit" organizationId="org" eventId="event"><main>Workflow controls</main></AppShell>);
    expect(html).toContain("SAGE");
    expect(html).toContain("Summit");
    expect(html).toContain("Event workspace");
    expect(html).toContain("Settings");
    expect(html).toContain("Workflow controls");
  });

  it("renders the rail pickers with the event's pages nested under the active event", () => {
    const html = renderToStaticMarkup(<AppShell organizationId="org-1" eventId="event-1"
      organizations={[{ id: "org-1", name: "Mindvalley" }]}
      events={[{ id: "event-1", name: "Speaking Summit" }, { id: "event-2", name: "Other" }]}
      playbookReady activePage="playbook"><main>Split</main></AppShell>);
    expect(html).toContain("Mindvalley");
    expect(html).toContain("Speaking Summit");
    expect(html).toContain("Sources");
    expect(html).toContain("Playbook");
    expect(html).toContain("/events/event-1/playbook");
    // Only the active event expands its pages.
    expect(html.match(/rail-sub/g)?.length ?? 0).toBe(1);
  });

  it("shows the playbook as pending until the sheet exists", () => {
    const html = renderToStaticMarkup(<AppShell organizationId="org-1" eventId="event-1"
      organizations={[{ id: "org-1", name: "SAGE" }]} events={[{ id: "event-1", name: "Summit" }]}
      playbookReady={false} activePage="sources"><main /></AppShell>);
    expect(html).toContain("generating…");
    expect(html).not.toContain("/events/event-1/playbook");
  });
});
