import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";
import { api } from "../convex/_generated/api";
import { authorizedConvex } from "../lib/server-session";
import { AppShell } from "./components/AppShell";
import { createEvent, createOrganization } from "./actions";

export default async function Home({ searchParams }: { searchParams: Promise<{ organization?: string }> }) {
  const client = await authorizedConvex();
  if (!client) {
    return <main className="signin-page"><div className="signin-intro"><p className="eyebrow">SAGE · OPERATIONS</p><h1>Run of Show Compiler</h1><p className="muted">Convex is not configured for this deployment yet. Set NEXT_PUBLIC_CONVEX_URL and the Clerk keys, then reload.</p></div></main>;
  }
  let organizations;
  try {
    organizations = await client.query(api.organizations.listMine, {});
  } catch {
    return <main className="signin-page"><div className="signin-intro"><p className="eyebrow">SAGE · OPERATIONS</p><h1>Not authorized</h1><p className="muted">Your account is signed in but not on the access allowlist for this deployment. Ask an administrator to add your email, then sign in again.</p><SignOutButton redirectUrl="/sign-in"><button className="quiet-button">Sign out</button></SignOutButton></div></main>;
  }
  const requested = (await searchParams).organization;
  const active = organizations.find(org => org?._id === requested) ?? organizations[0];
  const events = active ? await client.query(api.events.list, { organizationId: active._id }) : [];
  return <AppShell organizationName={active?.name} organizationId={active?._id} activeNav="overview"><main className="dashboard">
    <header className="dashboard-header"><div><p className="eyebrow">SAGE · OPERATIONS</p><h1>Run of Show Compiler</h1></div><SignOutButton redirectUrl="/sign-in"><button className="quiet-button">Sign out</button></SignOutButton></header>
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
    <p className="dashboard-note">Google sources reconcile automatically every 2 minutes · AI-extracted fields always require operator approval before they enter the master.</p>
  </main></AppShell>;
}
