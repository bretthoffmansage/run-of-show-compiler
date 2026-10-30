import Link from "next/link";
import type { ReactNode } from "react";

export interface RailItem { id: string; name: string }

/**
 * App frame with the thin SAGE rail on the left. When organization/event
 * lists are provided (event pages), the rail is the picker from the
 * proof-of-concept: script logo, ORGANIZATION and EVENT sections, and the
 * event's pages (Sources / Playbook) nested under the active event. Pages
 * that don't pass lists (home, settings) keep the simple nav.
 */
export function AppShell({ children, organizationName, eventName, organizationId, eventId, activeNav, organizations, events, playbookReady, activePage }: {
  children: ReactNode;
  organizationName?: string | null;
  eventName?: string | null;
  organizationId?: string | null;
  eventId?: string | null;
  activeNav?: "overview" | "event" | "settings";
  organizations?: RailItem[];
  events?: RailItem[];
  playbookReady?: boolean;
  activePage?: "sources" | "playbook";
}) {
  const pickers = Boolean(organizations?.length || events?.length);
  return <div className="app-frame">
    <aside className="app-rail" aria-label="Workspace context">
      <Link className="app-brand" href="/" aria-label="Run of Show Compiler home"><span className="brand-script">sage</span></Link>
      {pickers ? <nav className="rail-pickers" aria-label="Organization and event">
        <p className="nav-label">Organization</p>
        <ul className="rail-list">
          {(organizations ?? []).map(org => <li key={org.id}>
            <Link href={`/?organization=${org.id}`} className={org.id === organizationId ? "rail-active" : ""} aria-current={org.id === organizationId ? "true" : undefined}>{org.name}</Link>
          </li>)}
        </ul>
        <p className="nav-label">Event</p>
        <ul className="rail-list">
          {(events ?? []).map(item => <li key={item.id}>
            <Link href={`/events/${item.id}`} className={item.id === eventId ? "rail-active" : ""} aria-current={item.id === eventId ? "true" : undefined}>{item.name}</Link>
            {item.id === eventId && <ul className="rail-sub">
              <li><Link href={`/events/${item.id}`} className={activePage === "sources" ? "rail-active" : ""}>Sources</Link></li>
              {playbookReady
                ? <li><Link href={`/events/${item.id}/playbook`} className={activePage === "playbook" ? "rail-active" : ""}>Playbook</Link></li>
                : <li><span className="rail-hint">Playbook (generating…)</span></li>}
            </ul>}
          </li>)}
        </ul>
      </nav> : <>
        <nav className="app-nav" aria-label="Primary navigation">
          <p className="nav-label">WORKSPACE</p>
          <Link href="/" aria-current={activeNav === "overview" ? "page" : undefined} className={activeNav === "overview" ? "app-nav-active" : ""}>Overview</Link>
          {eventId && <Link href={`/events/${eventId}`} aria-current={activeNav === "event" ? "page" : undefined} className={activeNav === "event" ? "app-nav-active" : ""}>Event workspace</Link>}
          <Link href="/settings" aria-current={activeNav === "settings" ? "page" : undefined} className={activeNav === "settings" ? "app-nav-active" : ""}>Settings</Link>
        </nav>
        <div className="rail-context"><p className="nav-label">ORGANIZATION</p><strong>{organizationName ?? "Not selected"}</strong><Link href={organizationId ? `/?organization=${organizationId}` : "/#org-title"}>Change organization ↗</Link><p className="nav-label">EVENT</p><strong>{eventName ?? "Not selected"}</strong>{eventId ? <Link href={`/events/${eventId}`}>Current workspace ↗</Link> : <span className="rail-hint">Choose an event from the list</span>}</div>
      </>}
      <div className="rail-foot-links"><Link href="/settings">Settings</Link></div>
    </aside>
    <div className="app-frame-content">{children}</div>
  </div>;
}
