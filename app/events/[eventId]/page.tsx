import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { parseConvexId } from "../../../lib/convex-id";
import { authorizedConvex } from "../../../lib/server-session";
import { addGoogleSource, addManualSource, editMaster, refreshSource, removeSource, setSourcePaused } from "../../actions";
import { CompiledEntries, SourceRows } from "../../components/Workspace";
import { RevisionHistory } from "../../components/RevisionHistory";
import { AutoRefresh } from "../../components/AutoRefresh";
import { AppShell } from "../../components/AppShell";
import { loadEventWorkspace } from "./workspace-data";

/**
 * Page 1 of an event: a simple screen — add documents, see each one's
 * status at a glance. No embeds here; the documents and the playbook
 * render full-screen on the split page (./playbook) once the sheet exists.
 */
export default async function EventSources({ params, searchParams }: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const client = await authorizedConvex();
  if (!client) redirect("/sign-in");
  const eventId = parseConvexId<"events">((await params).eventId);
  if (!eventId) notFound();
  const notice = (await searchParams).notice;
  const data = await loadEventWorkspace(client, eventId);
  const { event, organization, sources, revision, history, runs, googleStatus, playbook, workspaceSources, entries, rail, proposals } = data;
  const latestRun = runs[0];
  const runningRun = runs.find(run => run.status === "running");
  const liveSources = sources.filter(source => source.provider !== "manual");
  const playbookReady = Boolean(playbook?.url);
  return <AppShell organizationName={organization.name} organizationId={organization._id} eventName={event.name} eventId={eventId}
    organizations={rail.organizations} events={rail.events} playbookReady={playbookReady} activePage="sources">
    <main className="event-page">
      <AutoRefresh seconds={runningRun ? 10 : 30} />
      <header className="page-head">
        <div>
          <p className="eyebrow">SAGE · {organization.name} · SOURCES</p>
          <h1>{event.name}</h1>
        </div>
        <p className="workspace-status" suppressHydrationWarning>
          {sources.length} sources · Compiled revision {revision?.number ?? "none"}
          {runningRun ? " · Compiling…" : latestRun ? ` · Last compile ${latestRun.status}${latestRun.status === "failed" && latestRun.error ? ` (${latestRun.error})` : ""}` : ""}
        </p>
        <div className="page-head-actions">
          {playbookReady && <Link className="primary-link" href={`/events/${eventId}/playbook`}>Open playbook split view →</Link>}
          <SignOutButton redirectUrl="/sign-in"><button className="quiet-button">Sign out</button></SignOutButton>
        </div>
      </header>
      {notice && <p className="notice-banner" role="status">{notice}</p>}
      {liveSources.length > 0 && !googleStatus.connected && <p className="notice-banner warn" role="alert">No studio Google account is connected, so live sources cannot sync. <Link href="/settings">Connect it in Settings →</Link></p>}
      {googleStatus.connected && (!googleStatus.scopes.includes("spreadsheets") || !googleStatus.scopes.includes("drive.file")) && <p className="notice-banner warn" role="alert">The Google connection predates the latest playbook permissions (creating and sharing the playbook sheet). <Link href="/settings">Reconnect it in Settings →</Link> — one click, keep every permission checked — and the playbook will generate and appear here on its own.</p>}
      {playbook?.lastError && <p className="notice-banner warn" role="alert">Playbook sheet: {{
        needs_reconnect_for_sheets: "reconnect Google in Settings to grant spreadsheet access — it will generate on its own after that",
        no_google_connection: "connect the studio Google account in Settings and it will generate on its own",
        google_connection_failed: "the Google connection is failing; reconnect it in Settings",
      }[playbook.lastError] ?? `last write failed (${playbook.lastError}) — it retries every couple of minutes`}.</p>}
      <div className="event-tools">
        <section className="dashboard-panel"><p className="eyebrow">SOURCES</p><h2>Client documents</h2>
          <SourceRows sources={workspaceSources} actions={{ refresh: refreshSource, setPaused: setSourcePaused, remove: removeSource }} />
        </section>
        <section className="dashboard-panel"><p className="eyebrow">INTAKE</p><h2>Connect sources</h2>
          <div className="intake-grid">
            <form action={addGoogleSource} className="stacked-form">
              <p className="muted">Live Google Doc or Sheet. The studio account must have at least view access to the file.</p>
              <input type="hidden" name="eventId" value={eventId} />
              <label htmlFor="google-name">Source name</label><input id="google-name" name="name" maxLength={120} required placeholder="Client schedule" />
              <label htmlFor="google-url">docs.google.com link</label><input id="google-url" name="url" type="url" required placeholder="https://docs.google.com/spreadsheets/d/…" />
              <button type="submit">Connect live source</button>
            </form>
            <form action={addManualSource} className="stacked-form">
              <p className="muted">Static paste for anything without a connector yet (emails, PDFs, Airtable exports). Not live.</p>
              <input type="hidden" name="eventId" value={eventId} />
              <label htmlFor="source-name">Source name</label><input id="source-name" name="name" maxLength={120} required />
              <label htmlFor="source-content">Source text</label><textarea id="source-content" name="content" rows={6} required />
              <button type="submit">Add static source</button>
            </form>
          </div>
        </section>
        <section className="dashboard-panel"><p className="eyebrow">COMPILED</p><h2>Compiled run of show</h2>
          <p className="muted">Sources compile automatically — nothing waits for approval. {history.decisions.length} compile decisions across {history.revisions.length} immutable revisions.</p>
          {revision ? <a className="export-link" href={`/api/events/${eventId}/export`}>Download compiled HTML →</a> : <p className="muted">Add a source and the run of show compiles itself.</p>}
          <CompiledEntries entries={entries} />
          {entries.length ? <form action={editMaster} className="stacked-form"><input type="hidden" name="eventId" value={eventId}/><label htmlFor="entry-key">Entry</label><select id="entry-key" name="entryKey">{entries.map(entry => <option key={entry.id} value={entry.id}>{entry.title}</option>)}</select><label htmlFor="edited-title">Corrected title</label><input id="edited-title" name="value" required/><button type="submit">Save title as new revision</button></form> : null}
        </section>
        <RevisionHistory revisions={history.revisions} decisions={history.decisions} proposals={proposals} />
      </div>
    </main>
  </AppShell>;
}
