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

export type FieldMark = "conflict" | "changed" | null;

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
  extras: Array<{ key: string; value: string; mark?: FieldMark }>;
  titleMark?: FieldMark;
  timeMark?: FieldMark;
  speakerMark?: FieldMark;
  detailsMark?: FieldMark;
}

/** Marks render as text color, never background: red = sources disagree, pink = fresh change. */
export function markClass(mark: FieldMark | undefined): string {
  return mark === "conflict" ? "text-conflict" : mark === "changed" ? "text-changed" : "";
}

export interface SourceActions {
  refresh: (form: FormData) => void;
  setPaused: (form: FormData) => void;
  remove: (form: FormData) => void;
}

const STALE_AFTER_MS = 10 * 60_000;

function safeOriginalUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch { return null; }
}

/** The client's document rendered live. Google Docs/Sheets and Drive files embed via /preview. */
function embedUrl(url: string | null): string | null {
  const safe = safeOriginalUrl(url);
  if (!safe) return null;
  const parsed = new URL(safe);
  if (parsed.hostname === "docs.google.com") {
    const match = parsed.pathname.match(/^\/(document|spreadsheets)(?:\/u\/\d+)?\/d\/([^/]+)/);
    if (match) return `https://docs.google.com/${match[1]}/d/${match[2]}/preview`;
    return null;
  }
  if (parsed.hostname === "drive.google.com") {
    const match = parsed.pathname.match(/^\/file(?:\/u\/\d+)?\/d\/([^/]+)/);
    if (match) return `https://drive.google.com/file/d/${match[1]}/preview`;
    return null;
  }
  return null;
}

function ago(value: number | null): string {
  if (value === null) return "never";
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
    case "needs_reauthorization": return { label: "Google connection expired — reconnect it in Settings", tone: "bad" };
    case "access_removed": return { label: "No access — share this file with the studio Google account", tone: "bad" };
    case "error": switch (source.lastError) {
      case "office_file": return { label: "Excel/Word file — in Google, use File → Save as Google Sheets (or Docs), then re-add that link", tone: "bad" };
      case "too_large": return { label: "File too large to sync", tone: "bad" };
      case "api_disabled": return { label: "The Google Drive API is turned off for this app's Google Cloud project — enable \"Google Drive API\" at console.cloud.google.com, then hit Refresh now", tone: "bad" };
      case "scope_insufficient": return { label: "The Google connection is missing Drive permission — disconnect and reconnect in Settings, keeping every checkbox checked on Google's consent screen", tone: "bad" };
      default: return { label: `Sync error${source.lastError ? ` · ${source.lastError}` : ""}`, tone: "bad" };
    }
    default: return { label: source.state, tone: "quiet" };
  }
}

/**
 * Tabbed client-document viewer: browser-style tabs across the top (they
 * switch only this pane), the selected document rendered as a live embed —
 * the extracted-text view stays available as a toggle, since an embed can
 * only render for viewers whose Google account can open the file.
 */
export function SourcePane({ sources, actions, fill }: { sources: WorkspaceSource[]; actions?: SourceActions; fill?: boolean }) {
  const [selectedId, setSelectedId] = useState(sources[0]?.id ?? null);
  const [view, setView] = useState<"document" | "text">("document");
  const selected = sources.find(source => source.id === selectedId) ?? sources[0];
  const status = selected ? sourceStatus(selected) : null;
  const embed = selected ? embedUrl(selected.originalUrl) : null;
  const showEmbed = view === "document" && embed !== null;
  return (
    <section className={`pane source-pane${fill ? " pane-fill" : ""}`} aria-labelledby="sources-title">
      {sources.length ? <>
        <div className="source-tabs" aria-label="Source documents">
          {sources.map(source => <button key={source.id} type="button" aria-pressed={selected?.id === source.id} onClick={() => setSelectedId(source.id)}>{source.name}</button>)}
        </div>
        {selected && status && <>
          <div className="source-toolbar">
            <span className={`status-chip status-${status.tone}`} suppressHydrationWarning>{status.label}</span>
            <span className="metadata" suppressHydrationWarning>
              {selected.provider === "manual"
                ? "Static input · no live sync"
                : `Checked ${ago(selected.lastCheckedAt)} · Synced ${ago(selected.lastSyncAt)}${selected.lastRevision ? ` · Rev ${selected.lastRevision}` : ""}`}
            </span>
            <span className="toolbar-spacer" />
            {embed && <span className="view-toggle" role="group" aria-label="Source view">
              <button type="button" className="quiet-button" aria-pressed={view === "document"} onClick={() => setView("document")}>Document</button>
              <button type="button" className="quiet-button" aria-pressed={view === "text"} onClick={() => setView("text")}>Text</button>
            </span>}
            {safeOriginalUrl(selected.originalUrl) && <a href={safeOriginalUrl(selected.originalUrl)!} target="_blank" rel="noopener noreferrer">Open original ↗</a>}
            {actions && <>
              {selected.provider !== "manual" && selected.state !== "paused" && <form action={actions.refresh}><input type="hidden" name="eventId" value={selected.eventId} /><input type="hidden" name="sourceId" value={selected.id} /><button type="submit" className="quiet-button">Refresh now</button></form>}
              {selected.provider !== "manual" && <form action={actions.setPaused}><input type="hidden" name="eventId" value={selected.eventId} /><input type="hidden" name="sourceId" value={selected.id} /><input type="hidden" name="paused" value={selected.state === "paused" ? "false" : "true"} /><button type="submit" className="quiet-button">{selected.state === "paused" ? "Resume sync" : "Pause sync"}</button></form>}
              <form action={actions.remove}><input type="hidden" name="eventId" value={selected.eventId} /><input type="hidden" name="sourceId" value={selected.id} /><button type="submit" className="quiet-button danger">Remove</button></form>
            </>}
          </div>
          {showEmbed
            ? <iframe key={selected.id} className="source-embed" src={embed!} title={selected.name} referrerPolicy="no-referrer" />
            : <pre className="source-text">{selected.preview ?? "No accessible snapshot or preview is available yet."}</pre>}
        </>}
      </> : <div className="empty"><span className="empty-mark" aria-hidden="true">↗</span><h3>No sources yet</h3><p>Connect a Google Doc or Sheet, or paste a static source, in the intake panel below.</p></div>}
    </section>
  );
}

/** The compiled run of show as a list, with the red/pink marking legend. */
export function CompiledEntries({ entries }: { entries: WorkspaceEntry[] }) {
  const dayHeadings = entries.map((entry, index) => {
    const previousDate = entries.slice(0, index).findLast(prior => prior.date)?.date ?? null;
    return entry.date && entry.date !== previousDate ? entry.date : null;
  });
  if (!entries.length) return <div className="empty"><span className="empty-mark" aria-hidden="true">≡</span><h3>Nothing compiled yet</h3><p>Connect a source and the run of show compiles itself — no approvals, no buttons.</p></div>;
  return <div className="master-list">
    {entries.map((entry, index) => {
      const dayHeading = dayHeadings[index];
      return (
        <div key={entry.id}>
          {dayHeading && <p className="day-heading">{dayHeading}</p>}
          <article className="master-entry">
            <div className="entry-top"><time className={markClass(entry.timeMark)}>{entry.time ?? "Time unresolved"}</time>{entry.changeState !== "approved" && <span className={`change-badge ${markClass(entry.changeState === "conflict" ? "conflict" : "changed")}`}>{entry.changeState === "conflict" ? "sources disagree" : "changed"}</span>}</div>
            <h3 className={markClass(entry.titleMark)}>{entry.title}</h3>
            {entry.speaker && <p className={`entry-speaker ${markClass(entry.speakerMark)}`}>{entry.speaker}</p>}
            {entry.details && <p className={markClass(entry.detailsMark)}>{entry.details}</p>}
            {entry.extras.length > 0 && <ul className="entry-extras">{entry.extras.map(extra => <li key={extra.key}><span>{extra.key.replaceAll("_", " ")}</span><span className={markClass(extra.mark)}>{extra.value}</span></li>)}</ul>}
            <p className="provenance">Source: {entry.sourceName ?? "Operator"}{entry.sourceRevision ? ` · Revision ${entry.sourceRevision}` : ""}</p>
          </article>
        </div>
      );
    })}
    <p className="review-note"><span className="text-conflict">Red</span> = your sources disagree or the value is unresolved — ask the client. <span className="text-changed">Pink</span> = changed by a source edit in the last 24 hours.</p>
  </div>;
}
