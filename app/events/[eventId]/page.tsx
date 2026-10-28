import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { parseConvexId } from "../../../lib/convex-id";
import { authorizedConvex } from "../../../lib/server-session";
import {
  addGoogleSource, addManualSource, approveNonConflicting, approveProposal, editMaster,
  refreshSource, rejectAllPending, rejectProposal, removeSource, setSourcePaused,
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
  const [sources, proposals, revision, history, runs, googleStatus] = await Promise.all([
    client.query(api.sources.list, { eventId }),
    client.query(api.master.listProposals, { eventId }),
    client.query(api.master.latest, { eventId }),
    client.query(api.master.history, { eventId }),
    client.query(api.extraction.recentForEvent, { eventId }),
    client.query(api.google.status, {}),
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
  const entries: WorkspaceEntry[] = [...grouped].map(([id, fields]): WorkspaceEntry => {
    const find = (key: string) => fields.find(field => field.fieldKey === key)?.value;
    const origin = fields.find(field => field.snapshotId);
    const source = origin?.snapshotId ? provenanceBySnapshot.get(origin.snapshotId) : null;
    const extras = fields
      .filter(field => !ENTRY_TOP_FIELDS.has(field.fieldKey))
      .map(field => ({ key: field.fieldKey, value: field.value.length > 220 ? `${field.value.slice(0, 220)}…` : field.value }));
    return {
      id, date: find("date") ?? null, time: find("start_time") ?? null, title: find("title") ?? "Title unresolved",
      speaker: find("speaker") ?? null, sourceName: source?.sourceName ?? null, sourceRevision: source?.revision ?? null,
      changeState: "approved", details: find("additional_detail") ?? null, extras,
    };
  }).sort((a, b) => `${a.date ?? "9999-99-99"} ${a.time ?? "99:99"}`.localeCompare(`${b.date ?? "9999-99-99"} ${b.time ?? "99:99"}`) || a.id.localeCompare(b.id));
  const pending = proposals.filter(proposal => proposal.state === "pending");
  const latestRun = runs[0];
  const runningRun = runs.find(run => run.status === "running");
  const liveSources = sources.filter(source => source.provider !== "manual");
  return <AppShell organizationName={organization.name} organizationId={organization._id} eventName={event.name} eventId={eventId} activeNav="event"><main className="event-page">
    <AutoRefresh seconds={runningRun ? 10 : 30} />
    <header className="dashboard-header"><div><Link className="back-link" href={`/?organization=${event.organizationId}`}>← All events</Link><p className="eyebrow">SAGE · {organization.name} · EVENT WORKSPACE</p><h1>{event.name}</h1></div><SignOutButton redirectUrl="/sign-in"><button className="quiet-button">Sign out</button></SignOutButton></header>
    {notice && <p className="notice-banner" role="status">{notice}</p>}
    {liveSources.length > 0 && !googleStatus.connected && <p className="notice-banner warn" role="alert">No studio Google account is connected, so live sources cannot sync. <Link href="/settings">Connect it in Settings →</Link></p>}
    <p className="workspace-status" suppressHydrationWarning>
      {sources.length} sources · {pending.length} pending fields · Approved revision {revision?.number ?? "none"}
      {runningRun ? " · AI extraction running…" : latestRun ? ` · Last extraction ${latestRun.status}${latestRun.status === "failed" && latestRun.error ? ` (${latestRun.error})` : ""}` : ""}
    </p>
    <Workspace sources={workspaceSources} entries={entries} actions={{ refresh: refreshSource, setPaused: setSourcePaused, remove: removeSource }} />
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
      <section className="dashboard-panel"><p className="eyebrow">04 / DECISIONS</p><h2>Review proposed fields</h2><p className="muted">Nothing enters the approved master until you approve it. Conflicting values must be decided individually.</p>
        {pending.length > 1 && <div className="batch-actions">
          <form action={approveNonConflicting}><input type="hidden" name="eventId" value={eventId} /><button type="submit">Approve all non-conflicting ({pending.length})</button></form>
          <form action={rejectAllPending}><input type="hidden" name="eventId" value={eventId} /><button type="submit" className="quiet-button">Reject all pending</button></form>
        </div>}
        {pending.length ? <div className="proposal-list">{pending.map(proposal => {
          const prior = revision?.fields.find(field => field.entryKey === proposal.entryKey && field.fieldKey === proposal.fieldKey)?.value;
          const competing = pending.some(other => other._id !== proposal._id && other.entryKey === proposal.entryKey && other.fieldKey === proposal.fieldKey && other.proposedValue !== proposal.proposedValue);
          const source = provenanceBySnapshot.get(proposal.snapshotId);
          return <article className="proposal" key={proposal._id}><div className="proposal-meta">{proposal.fieldKey.replaceAll("_", " ")} · {Math.round(proposal.confidence * 100)}% confidence{competing ? " · conflict" : ""} · {proposal.entryKey}</div><div className="comparison"><div><span>Approved</span><strong>{prior ?? "Unresolved"}</strong></div><div><span>Proposed</span><strong>{proposal.proposedValue}</strong></div></div><blockquote>{proposal.snippet}</blockquote><p className="provenance">{source?.sourceName ?? "Unknown source"} · {source?.revision ?? "Unknown revision"} · {source ? new Date(source.capturedAt).toLocaleString("en-US", { timeZone: "UTC" }) + " UTC" : ""} · {proposal.origin.replaceAll("_", " ")}</p><div className="proposal-actions"><form action={approveProposal}><input type="hidden" name="eventId" value={eventId}/><input type="hidden" name="proposalId" value={proposal._id}/><button type="submit">Approve</button></form><form action={rejectProposal}><input type="hidden" name="eventId" value={eventId}/><input type="hidden" name="proposalId" value={proposal._id}/><button type="submit" className="quiet-button">Reject</button></form></div></article>;
        })}</div> : <p className="muted">No fields awaiting review.</p>}
      </section>
      <section className="dashboard-panel"><p className="eyebrow">05 / MASTER</p><h2>Approved output</h2><p className="muted">{history.decisions.length} decisions recorded across {history.revisions.length} immutable revisions.</p>{revision ? <a className="export-link" href={`/api/events/${eventId}/export`}>Download approved HTML →</a> : <p className="muted">Approve a proposed field before exporting.</p>}
        {entries.length ? <form action={editMaster} className="stacked-form"><input type="hidden" name="eventId" value={eventId}/><label htmlFor="entry-key">Entry</label><select id="entry-key" name="entryKey">{entries.map(entry => <option key={entry.id} value={entry.id}>{entry.title}</option>)}</select><label htmlFor="edited-title">Corrected title</label><input id="edited-title" name="value" required/><button type="submit">Save title as new revision</button></form> : null}
      </section>
      <RevisionHistory revisions={history.revisions} decisions={history.decisions} proposals={proposals} />
    </div>
  </main></AppShell>;
}
