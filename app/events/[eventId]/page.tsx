import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { parseConvexId } from "../../../lib/convex-id";
import { authorizedConvex } from "../../../lib/server-session";
import {
  addGoogleSource, addManualSource, editMaster,
  refreshSource, removeSource, setSourcePaused,
} from "../../actions";
import { Workspace, type WorkspaceEntry, type WorkspaceSource } from "../../components/Workspace";
import { RevisionHistory } from "../../components/RevisionHistory";
import { AutoRefresh } from "../../components/AutoRefresh";
import { AppShell } from "../../components/AppShell";

const ENTRY_TOP_FIELDS = new Set(["title", "date", "start_time", "speaker", "additional_detail"]);

export default async function EventWorkspace({ params, searchParams }: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const client = await authorizedConvex();
  if (!client) redirect("/sign-in");
  const eventId = parseConvexId<"events">((await params).eventId);
  if (!eventId) notFound();
  const notice = (await searchParams).notice;
  let event;
  try {
    event = await client.query(api.events.get, { eventId });
  } catch { notFound(); }
  const organization = await client.query(api.organizations.get, { organizationId: event.organizationId });
  const [sources, proposals, revision, history, runs, googleStatus, playbook] = await Promise.all([
    client.query(api.sources.list, { eventId }),
    client.query(api.master.listProposals, { eventId }),
    client.query(api.master.latest, { eventId }),
    client.query(api.master.history, { eventId }),
    client.query(api.extraction.recentForEvent, { eventId }),
    client.query(api.google.status, {}),
    client.query(api.playbooks.forEvent, { eventId }),
  ]);
  const snapshots = await Promise.all(sources.map(source => client.query(api.snapshots.latest, { sourceId: source._id })));
  const provenanceIds = [...new Set([
    ...(revision?.fields ?? []).flatMap(field => field.snapshotId ? [field.snapshotId] : []),
    ...proposals.map(proposal => proposal.snapshotId),
  ])];
  const provenance = await Promise.all(provenanceIds.map(snapshotId => client.query(api.snapshots.getProvenance, { snapshotId })));
  const provenanceBySnapshot = new Map(provenanceIds.map((id, index) => [id, provenance[index]]));
  const workspaceSources: WorkspaceSource[] = sources.map((source, index) => ({
    id: source._id, eventId, name: source.name, provider: source.provider, state: source.state,
    lastCheckedAt: source.lastCheckedAt ?? null, lastSyncAt: source.lastSyncAt ?? null,
    lastRevision: source.lastRevision ?? null, lastError: source.lastError ?? null,
    preview: snapshots[index]?.content ?? null,
    originalUrl: source.provider === "manual" ? null : source.url,
  }));
  const grouped = new Map<string, Doc<"masterRevisions">["fields"]>();
  for (const field of revision?.fields ?? []) grouped.set(field.entryKey, [...(grouped.get(field.entryKey) ?? []), field]);
  const FRESH_CHANGE_MS = 24 * 60 * 60 * 1000;
  const entries: WorkspaceEntry[] = [...grouped].map(([id, fields]): WorkspaceEntry => {
    const find = (key: string) => fields.find(field => field.fieldKey === key);
    const mark = (field?: { conflict?: boolean; changedAt?: number }) =>
      field?.conflict ? "conflict" as const : field?.changedAt && Date.now() - field.changedAt < FRESH_CHANGE_MS ? "changed" as const : null;
    const origin = fields.find(field => field.snapshotId);
    const source = origin?.snapshotId ? provenanceBySnapshot.get(origin.snapshotId) : null;
    const extras = fields
      .filter(field => !ENTRY_TOP_FIELDS.has(field.fieldKey))
      .map(field => ({ key: field.fieldKey, value: field.value.length > 220 ? `${field.value.slice(0, 220)}…` : field.value, mark: mark(field) }));
    const hasConflict = fields.some(field => field.conflict);
    const hasFreshChange = fields.some(field => field.changedAt && Date.now() - field.changedAt < FRESH_CHANGE_MS);
    return {
      id, date: find("date")?.value ?? null, time: find("start_time")?.value ?? null, title: find("title")?.value ?? "Title unresolved",
      speaker: find("speaker")?.value ?? null, sourceName: source?.sourceName ?? null, sourceRevision: source?.revision ?? null,
      changeState: hasConflict ? "conflict" : hasFreshChange ? "changed" : "approved",
      details: find("additional_detail")?.value ?? null, extras,
      titleMark: mark(find("title")), timeMark: mark(find("start_time")), speakerMark: mark(find("speaker")), detailsMark: mark(find("additional_detail")),
    };
  }).sort((a, b) => `${a.date ?? "9999-99-99"} ${a.time ?? "99:99"}`.localeCompare(`${b.date ?? "9999-99-99"} ${b.time ?? "99:99"}`) || a.id.localeCompare(b.id));
  const latestRun = runs[0];
  const runningRun = runs.find(run => run.status === "running");
  const liveSources = sources.filter(source => source.provider !== "manual");
  return <AppShell organizationName={organization.name} organizationId={organization._id} eventName={event.name} eventId={eventId} activeNav="event"><main className="event-page">
    <AutoRefresh seconds={runningRun ? 10 : 30} />
    <header className="dashboard-header"><div><Link className="back-link" href={`/?organization=${event.organizationId}`}>← All events</Link><p className="eyebrow">SAGE · {organization.name} · EVENT WORKSPACE</p><h1>{event.name}</h1></div><SignOutButton redirectUrl="/sign-in"><button className="quiet-button">Sign out</button></SignOutButton></header>
    {notice && <p className="notice-banner" role="status">{notice}</p>}
    {liveSources.length > 0 && !googleStatus.connected && <p className="notice-banner warn" role="alert">No studio Google account is connected, so live sources cannot sync. <Link href="/settings">Connect it in Settings →</Link></p>}
    {googleStatus.connected && !googleStatus.scopes.includes("spreadsheets") && <p className="notice-banner warn" role="alert">The Google connection predates playbook creation and can&apos;t create spreadsheets. <Link href="/settings">Reconnect it in Settings →</Link> (one click, keep every permission checked) and the playbook sheet will generate on the next compile.</p>}
    {playbook?.lastError && <p className="notice-banner warn" role="alert">Playbook sheet: last write failed ({playbook.lastError === "needs_reconnect_for_sheets" ? "reconnect Google in Settings to grant spreadsheet access" : playbook.lastError}).</p>}
    <p className="workspace-status" suppressHydrationWarning>
      {sources.length} sources · Compiled revision {revision?.number ?? "none"}
      {runningRun ? " · Compiling…" : latestRun ? ` · Last compile ${latestRun.status}${latestRun.status === "failed" && latestRun.error ? ` (${latestRun.error})` : ""}` : ""}
      {" · "}<span className="legend"><span className="text-conflict">red = sources disagree, ask the client</span> · <span className="text-changed">pink = changed in the last 24h</span></span>
    </p>
    <Workspace sources={workspaceSources} entries={entries} actions={{ refresh: refreshSource, setPaused: setSourcePaused, remove: removeSource }} playbookUrl={playbook?.url ?? null} />
    <div className="event-tools">
      <section className="dashboard-panel"><p className="eyebrow">03 / INTAKE</p><h2>Connect sources</h2>
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
      <section className="dashboard-panel"><p className="eyebrow">04 / MASTER</p><h2>Compiled run of show</h2><p className="muted">Sources compile automatically — nothing waits for approval. <span className="text-conflict">Red</span> marks fields your sources disagree on (or that are unresolved); <span className="text-changed">pink</span> marks values a client changed in the last 24 hours. {history.decisions.length} compile decisions across {history.revisions.length} immutable revisions.</p>{revision ? <a className="export-link" href={`/api/events/${eventId}/export`}>Download compiled HTML →</a> : <p className="muted">Add a source and the run of show compiles itself.</p>}
        {entries.length ? <form action={editMaster} className="stacked-form"><input type="hidden" name="eventId" value={eventId}/><label htmlFor="entry-key">Entry</label><select id="entry-key" name="entryKey">{entries.map(entry => <option key={entry.id} value={entry.id}>{entry.title}</option>)}</select><label htmlFor="edited-title">Corrected title</label><input id="edited-title" name="value" required/><button type="submit">Save title as new revision</button></form> : null}
      </section>
      <RevisionHistory revisions={history.revisions} decisions={history.decisions} proposals={proposals} />
    </div>
  </main></AppShell>;
}
