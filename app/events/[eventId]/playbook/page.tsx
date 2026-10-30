import { notFound, redirect } from "next/navigation";
import { parseConvexId } from "../../../../lib/convex-id";
import { authorizedConvex } from "../../../../lib/server-session";
import { refreshSource, removeSource, setSourcePaused } from "../../../actions";
import { SourcePane } from "../../../components/Workspace";
import { AutoRefresh } from "../../../components/AutoRefresh";
import { AppShell } from "../../../components/AppShell";
import { loadEventWorkspace } from "../workspace-data";

/**
 * The split screen, full bleed: client documents on the left (browser-style
 * tabs, live embeds, tabs move only this side), the playbook Google Sheet on
 * the right, and a draggable divider between them. Exists once the playbook
 * sheet has been generated; until then the event's Sources page is page 1.
 */
export default async function EventPlaybook({ params }: { params: Promise<{ eventId: string }> }) {
  const client = await authorizedConvex();
  if (!client) redirect("/sign-in");
  const eventId = parseConvexId<"events">((await params).eventId);
  if (!eventId) notFound();
  const data = await loadEventWorkspace(client, eventId);
  const { event, organization, playbook, workspaceSources, rail } = data;
  if (!playbook?.url) redirect(`/events/${eventId}`);
  return <AppShell organizationName={organization.name} organizationId={organization._id} eventName={event.name} eventId={eventId}
    organizations={rail.organizations} events={rail.events} playbookReady activePage="playbook">
    <main className="page-full split-page">
      <AutoRefresh seconds={60} />
      <header className="page-head slim">
        <div>
          <p className="eyebrow">SAGE · {organization.name} · PLAYBOOK</p>
          <h1>{event.name}</h1>
        </div>
        <div className="page-head-actions">
          <a className="primary-link" href={playbook.url} target="_blank" rel="noopener noreferrer">Open in Google Sheets ↗</a>
        </div>
      </header>
      <div className="split-full">
        <div className="split-left">
          <SourcePane sources={workspaceSources} actions={{ refresh: refreshSource, setPaused: setSourcePaused, remove: removeSource }} fill />
        </div>
        <div className="split-right">
          {playbook.shared
            ? <iframe className="split-playbook" src={`${playbook.url.replace(/\/edit.*$/, "")}/preview`} title="Playbook spreadsheet" referrerPolicy="no-referrer" />
            : <p className="muted playbook-pending">The playbook sheet exists but isn&apos;t link-shared yet, so it can&apos;t display here. It shares itself within a couple of minutes once the Google connection has the latest permissions.</p>}
        </div>
      </div>
    </main>
  </AppShell>;
}
