import { notFound } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { ConvexHttpClient } from "convex/browser";
import type { WorkspaceEntry, WorkspaceSource } from "../../components/Workspace";

const ENTRY_TOP_FIELDS = new Set(["title", "date", "start_time", "speaker", "additional_detail"]);
const FRESH_CHANGE_MS = 24 * 60 * 60 * 1000;

/** Everything both event pages (Sources, Playbook) need, assembled once. */
export async function loadEventWorkspace(client: ConvexHttpClient, eventId: Id<"events">) {
  let event;
  try {
    event = await client.query(api.events.get, { eventId });
  } catch { notFound(); }
  const [organization, organizations, events, sources, proposals, revision, history, runs, googleStatus, playbook] = await Promise.all([
    client.query(api.organizations.get, { organizationId: event.organizationId }),
    client.query(api.organizations.listMine, {}),
    client.query(api.events.list, { organizationId: event.organizationId }),
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
  return {
    event, organization, sources, proposals, revision, history, runs, googleStatus, playbook,
    workspaceSources, entries,
    rail: {
      organizations: organizations.flatMap(org => org ? [{ id: org._id as string, name: org.name }] : []),
      events: events.flatMap(item => item && !item.archived ? [{ id: item._id as string, name: item.name }] : []),
    },
  };
}
