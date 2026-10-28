"use client";

import { useState } from "react";

export interface WorkspaceSource {
  id: string;
  name: string;
  provider: string;
  state: "not_connected" | "paused" | "static" | "connected" | "stale" | "needs_reauthorization";
  lastSuccessfulSync: string | null;
  preview: string | null;
  originalUrl: string | null;
}

export interface WorkspaceEntry {
  id: string;
  time: string | null;
  title: string;
  sourceName: string | null;
  sourceRevision: string | null;
  changeState: "new" | "changed" | "conflict" | "needs_review" | "approved";
  details: string | null;
}

function safeOriginalUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "docs.google.com" ? url.toString() : null;
  } catch { return null; }
}

export function Workspace({ sources, entries }: { sources: WorkspaceSource[]; entries: WorkspaceEntry[] }) {
  const [selectedId, setSelectedId] = useState(sources[0]?.id ?? null);
  const selected = sources.find(source => source.id === selectedId) ?? sources[0];
  return (
    <div className="panes">
      <section className="pane" aria-labelledby="sources-title">
        <div className="pane-heading"><span className="eyebrow">01 / INPUTS</span><h2 id="sources-title">Sources</h2></div>
        {sources.length ? <>
          <div className="source-tabs" aria-label="Source documents">
            {sources.map(source => <button key={source.id} type="button" aria-pressed={selected?.id === source.id} onClick={() => setSelectedId(source.id)}>{source.name}</button>)}
          </div>
          {selected && <div className="source-detail">
            <p className="eyebrow">{selected.provider.replaceAll("_", " ")} · {selected.state.replaceAll("_", " ")}</p>
            <h3>{selected.name}</h3>
            <p className="metadata">{selected.provider === "manual" ? "Static input · no live sync" : `Last successful sync: ${selected.lastSuccessfulSync ?? "Never"}`}</p>
            <pre>{selected.preview ?? "No accessible snapshot or preview is available."}</pre>
            {safeOriginalUrl(selected.originalUrl) && <a href={safeOriginalUrl(selected.originalUrl)!} target="_blank" rel="noopener noreferrer">Open original ↗</a>}
          </div>}
        </> : <div className="empty"><span className="empty-mark" aria-hidden="true">↗</span><h3>No sources yet</h3><p>Add a static manual source in the intake panel below. Google Docs and Sheets connections are deferred; nothing here is live or syncing.</p></div>}
      </section>
      <section className="pane" aria-labelledby="master-title">
        <div className="pane-heading"><span className="eyebrow">02 / OUTPUT</span><h2 id="master-title">Master run of show</h2></div>
        {entries.length ? <div className="master-list">
          {entries.map(entry => <article key={entry.id} className="master-entry">
            <div className="entry-top"><time>{entry.time ?? "Time unresolved"}</time><span className="change-badge">{entry.changeState.replaceAll("_", " ")}</span></div>
            <h3>{entry.title}</h3>
            {entry.details && <p>{entry.details}</p>}
            <p className="provenance">Source: {entry.sourceName ?? "Operator"}{entry.sourceRevision ? ` · Revision ${entry.sourceRevision}` : ""}</p>
          </article>)}
          <p className="review-note">Approved fields only. Review pending proposals in the decisions panel below.</p>
        </div> : <div className="empty"><span className="empty-mark" aria-hidden="true">≡</span><h3>No master revision</h3><p>Approved event details will appear here after you review source proposals. No fields have been approved.</p></div>}
      </section>
    </div>
  );
}
