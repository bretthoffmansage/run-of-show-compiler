import Link from "next/link";
import type { ReactNode } from "react";

export function AppShell({ children, organizationName, eventName, organizationId, eventId, activeNav }: {
  children: ReactNode;
  organizationName?: string | null;
  eventName?: string | null;
  organizationId?: string | null;
  eventId?: string | null;
  activeNav?: "overview" | "event" | "settings";
}) {
  return <div className="app-frame">
    <aside className="app-rail" aria-label="Workspace context">
      <Link className="app-brand" href="/" aria-label="Run of Show Compiler home"><span className="brand-mark">S</span><span>RUN OF SHOW<small>COMPILER / SAGE</small></span></Link>
      <nav className="app-nav" aria-label="Primary navigation">
        <p className="nav-label">WORKSPACE</p>
        <Link href="/" aria-current={activeNav === "overview" ? "page" : undefined} className={activeNav === "overview" ? "app-nav-active" : ""}>Overview</Link>
        {eventId && <Link href={`/events/${eventId}`} aria-current={activeNav === "event" ? "page" : undefined} className={activeNav === "event" ? "app-nav-active" : ""}>Event workspace</Link>}
        <Link href="/settings" aria-current={activeNav === "settings" ? "page" : undefined} className={activeNav === "settings" ? "app-nav-active" : ""}>Settings</Link>
      </nav>
      <div className="rail-context"><p className="nav-label">ORGANIZATION</p><strong>{organizationName ?? "Not selected"}</strong><Link href={organizationId ? `/?organization=${organizationId}` : "/#org-title"}>Change organization ↗</Link><p className="nav-label">EVENT</p><strong>{eventName ?? "Not selected"}</strong>{eventId ? <Link href={`/events/${eventId}`}>Current workspace ↗</Link> : <span className="rail-hint">Choose an event from the list</span>}</div>
      <p className="rail-foot">SAGE OPERATIONS CONSOLE<br/>Live sources reconcile every 2 minutes</p>
    </aside>
    <div className="app-frame-content">{children}</div>
  </div>;
}
