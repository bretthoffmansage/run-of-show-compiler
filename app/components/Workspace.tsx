"use client";

import { useState } from "react";

export interface WorkspaceSource {
  id: string;
  eventId: string;
  name: string;
  provider: string;
  state: "not_connected" | "connected" | "paused" | "static" | "needs_reauthorization" | "access_removed" | "error";
  lastCheckedAt: number | null;
  lastSyncAt: number | null;
  lastRevision: string | null;
  lastError: string | null;
  preview: string | null;
  originalUrl: string | null;
}

export interface WorkspaceEntry {
  id: string;
  date: string | null;
  time: string | null;
  title: string;
  speaker: string | null;
  sourceName: string | null;
  sourceRevision: string | null;
  changeState: "new" | "changed" | "conflict" | "needs_review" | "approved";
  details: string | null;
  extras: Array<{ key: string; value: string }>;
}

export interface SourceActions {
  refresh: (form: FormData) => void;
  setPaused: (form: FormData) => void;
  remove: (form: FormData) => void;
}

const STALE_AFTER_MS = 10 * 60 * 1000;

function safeOriginalUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "docs.google.com" ? url.toString() : null;
  } catch { return null; }
}

function ago(value: number | null): string {
  if (!value) return "never";
  const minutes = Math.max(0, Math.round((Date.now() - value) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

function sourceStatus(source: WorkspaceSource): { label: string; tone: "ok" | "warn" | "bad" | "quiet" } {
  if (source.provider === "manual") return { label: "Static · manual input", tone: "quiet" };
  const stale = source.lastCheckedAt !== null && Date.now() - source.lastCheckedAt > STALE_AFTER_MS;
  switch (source.state) {
    case "connected": return stale ? { label: "Live · possibly stale", tone: "warn" } : { label: "Live · synced", tone: "ok" };
    case "not_connected": return source.lastError === "no_google_connection"
      ? { label: "Waiting for Google connection (Settings)", tone: "warn" }
      : { label: "Connecting…", tone: "quiet" };
    case "paused": return { label: "Paused", tone: "quiet" };
    case "needs_reauthorization": return { label: "Needs reauthorization", tone: "bad" };
    case "access_removed": return { label: "Access removed or file missing", tone: "bad" };
    case "error": return { label: `Sync error${source.lastError ? ` · ${source.lastError}` : ""}`, tone: "bad" };
    default: return { label: source.state, tone: "quiet" };
  }
}

export function Workspace({ sources, entries, actions }: { sources: WorkspaceSource[]; entries: WorkspaceEntry[]; actions?: SourceActions }) {
  const [selectedId, setSelectedId] = useState(sources[0]?.id ?? null);
  const selected = sources.find(source => source.id === selectedId) ?? sources[0];
  const status = selected ? sourceStatus(selected) : null;
  const dayHeadings = entries.map((entry, index) => {
    const previousDate = entries.slice(0, index).findLast(prior => prior.date)?.date ?? null;
    return entry.date && entry.date !== previousDate ? entry.date : null;
  });
  return (
    <div className="panes">
      <section className="pane" aria-labelledby="sources-title">
        <div className="pane-heading"><span className="eyebrow">01 / INPUTS</span><h2 id="sources-title">Sources</h2></div>
        {sources.length ? <>
          <div className="source-tabs" aria-label="Source documents">
            {sources.map(source => <button key={source.id} type="button" aria-pressed={selected?.id === source.id} onClick={() => setSelectedId(source.id)}>{source.name}</button>)}
          </div>
          {selected && status && <div className="source-detail">
            <p className="eyebrow">{selected.provider.replaceAll("_", " ")} · <span className={`status-chip status-${status.tone}`} suppressHydrationWarning>{status.label}</span></p>
            <h3>{selected.name}</h3>
            <p className="metadata" suppressHydrationWarning>
              {selected.provider === "manual"
                ? "Static input · no live sync"
                : `Checked ${ago(selected.lastCheckedAt)} · Synced ${ago(selected.lastSyncAt)}${selected.lastRevision ? ` · Rev ${selected.lastRevision}` : ""}`}
            </p>
            {actions && <div className="source-controls">
              {selected.provider !== "manual" && selected.state !== "paused" && <form action={actions.refresh}><input type="hidden" name="eventId" value={selected.eventId} /><input type="hidden" name="sourceId" value={selected.id} /><button type="submit" className="quiet-button">Refresh now</button></form>}
              {selected.provider !== "manual" && <form action={actions.setPaused}><input type="hidden" name="eventId" value={selected.eventId} /><input type="hidden" name="sourceId" value={selected.id} /><input type="hidden" name="paused" value={selected.state === "paused" ? "false" : "true"} /><button type="submit" className="quiet-button">{selected.state === "paused" ? "Resume sync" : "Pause sync"}</button></form>}
              <form action={actions.remove}><input type="hidden" name="eventId" value={selected.eventId} /><input type="hidden" name="sourceId" value={selected.id} /><button type="submit" className="quiet-button danger">Remove from event</button></form>
            </div>}
            <pre>{selected.preview ?? "No accessible snapshot or preview is available yet."}</pre>
            {safeOriginalUrl(selected.originalUrl) && <a href={safeOriginalUrl(selected.originalUrl)!} target="_blank" rel="noopener noreferrer">Open original ↗</a>}
          </div>}
        </> : <div className="empty"><span className="empty-mark" aria-hidden="true">↗</span><h3>No sources yet</h3><p>Connect a Google Doc or Sheet, or paste a static source, in the intake panel below.</p></div>}
      </section>
      <section className="pane" aria-labelledby="master-title">
        <div className="pane-heading"><span className="eyebrow">02 / OUTPUT</span><h2 id="master-title">Master run of show</h2></div>
        {entries.length ? <div className="master-list">
          {entries.map((entry, index) => {
            const dayHeading = dayHeadings[index];
            return (
              <div key={entry.id}>
                {dayHeading && <p className="day-heading">{dayHeading}</p>}
                <article className="master-entry">
                  <div className="entry-top"><time>{entry.time ?? "Time unresolved"}</time><span className="change-badge">{entry.changeState.replaceAll("_", " ")}</span></div>
                  <h3>{entry.title}</h3>
                  {entry.speaker && <p className="entry-speaker">{entry.speaker}</p>}
                  {entry.details && <p>{entry.details}</p>}
                  {entry.extras.length > 0 && <ul className="entry-extras">{entry.extras.map(extra => <li key={extra.key}><span>{extra.key.replaceAll("_", " ")}</span>{extra.value}</li>)}</ul>}
                  <p className="provenance">Source: {entry.sourceName ?? "Operator"}{entry.sourceRevision ? ` · Revision ${entry.sourceRevision}` : ""}</p>
                </article>
              </div>
            );
          })}
          <p className="review-note">Approved fields only. Review pending proposals in the decisions panel below.</p>
        </div> : <div className="empty"><span className="empty-mark" aria-hidden="true">≡</span><h3>No master revision</h3><p>Approved event details will appear here after you review source proposals. No fields have been approved.</p></div>}
      </section>
    </div>
  );
}
