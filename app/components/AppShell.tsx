import Link from "next/link";
import type { ReactNode } from "react";

export function AppShell({ children, organizationName, eventName, organizationId, eventId }: {
  children: ReactNode;
  organizationName?: string | null;
  eventName?: string | null;
  organizationId?: string | null;
  eventId?: string | null;
}) {
  return <div className="app-frame">
    <aside className="app-rail" aria-label="Workspace context">
      <Link className="app-brand" href="/" aria-label="Run of Show Compiler home"><span className="brand-mark">S</span><span>RUN OF SHOW<small>COMPILER / SAGE</small></span></Link>
      <nav className="app-nav" aria-label="Primary navigation"><p className="nav-label">WORKSPACE</p><Link href="/" aria-current={!eventId ? "page" : undefined} className={!eventId ? "app-nav-active" : ""}>Overview</Link>{eventId && <Link href={`/events/${eventId}`} aria-current="page" className="app-nav-active">Event workspace</Link>}</nav>
      <div className="rail-context"><p className="nav-label">ORGANIZATION</p><strong>{organizationName ?? "Not selected"}</strong><Link href={organizationId ? `/?organization=${organizationId}` : "/#org-title"}>Change organization ↗</Link><p className="nav-label">EVENT</p><strong>{eventName ?? "Not selected"}</strong>{eventId ? <Link href={`/events/${eventId}`}>Current workspace ↗</Link> : <span className="rail-hint">Choose an event from the list</span>}</div>
      <p className="rail-foot">LOCAL PREVIEW <span aria-hidden="true">·</span> STATIC SOURCES<br/>No Google or AI connection</p>
    </aside>
    <div className="app-frame-content">{children}</div>
  </div>;
}
