import Link from "next/link";
import { api } from "../convex/_generated/api";
import { authorizedConvex } from "../lib/server-session";
import { AccessGate } from "./components/AccessGate";
import { createEvent, createOrganization } from "./actions";

export default async function Home({ searchParams }: { searchParams: Promise<{ organization?: string; access?: string }> }) {
  const client = await authorizedConvex();
  if (!client) return <AccessGate denied={(await searchParams).access === "denied"} />;
  const organizations = await client.query(api.organizations.listMine, {});
  const requested = (await searchParams).organization;
  const active = organizations.find(org => org?._id === requested) ?? organizations[0];
  const events = active ? await client.query(api.events.list, { organizationId: active._id }) : [];
  return <main className="dashboard">
    <header className="dashboard-header"><div><p className="eyebrow">SAGE · OPERATIONS</p><h1>Run of Show Compiler</h1></div><form action="/api/sign-out" method="post"><button type="submit" className="quiet-button">Sign out</button></form></header>
    <div className="dashboard-grid">
      <section className="dashboard-panel" aria-labelledby="org-title">
        <p className="eyebrow">01 / CONTEXT</p><h2 id="org-title">Organizations</h2>
        {organizations.length ? <ul className="context-list">{organizations.map(org => org && <li key={org._id}><Link className={active?._id === org._id ? "selected" : ""} href={`/?organization=${org._id}`}>{org.name}</Link></li>)}</ul> : <p>No organization yet. Create one to begin.</p>}
        <form action={createOrganization} className="stacked-form"><label htmlFor="new-org">New organization</label><input id="new-org" name="name" maxLength={120} required placeholder="Organization name" /><button type="submit">Create organization</button></form>
      </section>
      <section className="dashboard-panel" aria-labelledby="event-title">
        <p className="eyebrow">02 / EVENTS</p><h2 id="event-title">{active?.name ?? "Select an organization"}</h2>
        {active ? <><p className="muted">Choose an event to review its sources and approved master.</p><ul className="context-list">{events.map(event => <li key={event._id}><Link href={`/events/${event._id}`}>{event.name}<span>Open workspace →</span></Link></li>)}</ul><form action={createEvent} className="stacked-form"><input type="hidden" name="organizationId" value={active._id} /><label htmlFor="new-event">New event</label><input id="new-event" name="name" maxLength={120} required placeholder="Event name" /><button type="submit">Create event</button></form></> : <p className="muted">Create an organization first.</p>}
      </section>
    </div>
    <p className="dashboard-note">Local single-operator preview · Manual sources are static · Google sync and AI extraction are deferred.</p>
  </main>;
}
