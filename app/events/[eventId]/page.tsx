import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { parseConvexId } from "../../../lib/convex-id";
import { authorizedConvex } from "../../../lib/server-session";
import { addManualSource, approveProposal, editMaster, rejectProposal } from "../../actions";
import { Workspace, type WorkspaceEntry, type WorkspaceSource } from "../../components/Workspace";

export default async function EventWorkspace({ params }: { params: Promise<{ eventId: string }> }) {
  const client = await authorizedConvex();
  if (!client) redirect("/");
  const eventId = parseConvexId<"events">((await params).eventId);
  if (!eventId) notFound();
  const event = await client.query(api.events.get, { eventId });
  const [sources, proposals, revision, history] = await Promise.all([
    client.query(api.sources.list, { eventId }),
    client.query(api.master.listProposals, { eventId }),
    client.query(api.master.latest, { eventId }),
    client.query(api.master.history, { eventId }),
  ]);
  const snapshots = await Promise.all(sources.map(source => client.query(api.snapshots.latest, { sourceId: source._id })));
  const provenanceIds = [...new Set([
    ...(revision?.fields ?? []).flatMap(field => field.snapshotId ? [field.snapshotId] : []),
    ...proposals.map(proposal => proposal.snapshotId),
  ])];
  const provenance = await Promise.all(provenanceIds.map(snapshotId => client.query(api.snapshots.getProvenance, { snapshotId })));
  const provenanceBySnapshot = new Map(provenanceIds.map((id, index) => [id, provenance[index]]));
  const workspaceSources: WorkspaceSource[] = sources.map((source, index) => ({
    id: source._id, name: source.name, provider: source.provider, state: source.state,
    lastSuccessfulSync: null, preview: snapshots[index]?.content ?? null,
    originalUrl: source.provider === "manual" ? null : source.url,
  }));
  const grouped = new Map<string, Doc<"masterRevisions">["fields"]>();
  for (const field of revision?.fields ?? []) grouped.set(field.entryKey, [...(grouped.get(field.entryKey) ?? []), field]);
  const entries: WorkspaceEntry[] = [...grouped].map(([id, fields]): WorkspaceEntry => {
    const find = (key: string) => fields.find(field => field.fieldKey === key)?.value;
    const origin = fields.find(field => field.snapshotId);
    const source = origin?.snapshotId ? provenanceBySnapshot.get(origin.snapshotId) : null;
    return { id, time: find("start_time") ?? null, title: find("title") ?? "Title unresolved",
      sourceName: source?.sourceName ?? null, sourceRevision: source?.revision ?? null, changeState: "approved",
      details: find("additional_detail") ?? null };
  }).sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99"));
  const pending = proposals.filter(proposal => proposal.state === "pending");
  return <main className="event-page">
    <header className="dashboard-header"><div><Link className="back-link" href={`/?organization=${event.organizationId}`}>← All events</Link><p className="eyebrow">SAGE · EVENT WORKSPACE</p><h1>{event.name}</h1></div><form action="/api/sign-out" method="post"><button type="submit" className="quiet-button">Sign out</button></form></header>
    <p className="workspace-status">{sources.length} sources · {pending.length} pending fields · Approved revision {revision?.number ?? "none"}</p>
    <Workspace sources={workspaceSources} entries={entries} />
    <div className="event-tools">
      <section className="dashboard-panel"><p className="eyebrow">03 / INTAKE</p><h2>Add static source</h2><p className="muted">Paste event notes, one item per line. This is not a Google connection or live sync. A date (YYYY-MM-DD) and 24-hour time (HH:mm) may prefix each line.</p>
        <form action={addManualSource} className="stacked-form"><input type="hidden" name="eventId" value={eventId}/><label htmlFor="source-name">Source name</label><input id="source-name" name="name" maxLength={120} required/><label htmlFor="source-content">Source text</label><textarea id="source-content" name="content" rows={8} required/><button type="submit">Add and review</button></form>
      </section>
      <section className="dashboard-panel"><p className="eyebrow">04 / DECISIONS</p><h2>Review proposed fields</h2><p className="muted">Nothing enters the approved master until you approve it. Review each field against its exact source line.</p>
        {pending.length ? <div className="proposal-list">{pending.map(proposal => {
          const prior = revision?.fields.find(field => field.entryKey === proposal.entryKey && field.fieldKey === proposal.fieldKey)?.value;
          const competing = pending.some(other => other._id !== proposal._id && other.entryKey === proposal.entryKey && other.fieldKey === proposal.fieldKey && other.proposedValue !== proposal.proposedValue);
          const source = provenanceBySnapshot.get(proposal.snapshotId);
          return <article className="proposal" key={proposal._id}><div className="proposal-meta">{proposal.fieldKey.replaceAll("_", " ")} · {Math.round(proposal.confidence * 100)}% confidence{competing ? " · conflict" : ""}</div><div className="comparison"><div><span>Approved</span><strong>{prior ?? "Unresolved"}</strong></div><div><span>Proposed</span><strong>{proposal.proposedValue}</strong></div></div><blockquote>{proposal.snippet}</blockquote><p className="provenance">{source?.sourceName ?? "Unknown source"} · {source?.revision ?? "Unknown revision"} · {source ? new Date(source.capturedAt).toLocaleString("en-US", { timeZone: "UTC" }) + " UTC" : ""} · {proposal.origin.replaceAll("_", " ")}</p><div className="proposal-actions"><form action={approveProposal}><input type="hidden" name="eventId" value={eventId}/><input type="hidden" name="proposalId" value={proposal._id}/><button type="submit">Approve</button></form><form action={rejectProposal}><input type="hidden" name="eventId" value={eventId}/><input type="hidden" name="proposalId" value={proposal._id}/><button type="submit" className="quiet-button">Reject</button></form></div></article>;
        })}</div> : <p className="muted">No fields awaiting review.</p>}
      </section>
      <section className="dashboard-panel"><p className="eyebrow">05 / MASTER</p><h2>Approved output</h2><p className="muted">{history.decisions.length} decisions recorded across {history.revisions.length} immutable revisions.</p>{revision ? <a className="export-link" href={`/api/events/${eventId}/export`}>Download approved HTML →</a> : <p className="muted">Approve a proposed field before exporting.</p>}
        {entries.length ? <form action={editMaster} className="stacked-form"><input type="hidden" name="eventId" value={eventId}/><label htmlFor="entry-key">Entry</label><select id="entry-key" name="entryKey">{entries.map(entry => <option key={entry.id} value={entry.id}>{entry.title}</option>)}</select><label htmlFor="edited-title">Corrected title</label><input id="edited-title" name="value" required/><button type="submit">Save title as new revision</button></form> : null}
      </section>
    </div>
  </main>;
}
