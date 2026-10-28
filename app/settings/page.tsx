import { redirect } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { api } from "../../convex/_generated/api";
import { authorizedConvex, signedInEmail } from "../../lib/server-session";
import { AppShell } from "../components/AppShell";
import { disconnectGoogle } from "../actions";

function timestamp(value: number | null | undefined): string {
  return value ? new Date(value).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "—";
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const client = await authorizedConvex();
  if (!client) redirect("/sign-in");
  const notice = (await searchParams).google;
  const [google, engine, email] = await Promise.all([
    client.query(api.google.status, {}),
    client.query(api.extraction.engine, {}),
    signedInEmail(),
  ]);
  const connectedNotice = notice?.startsWith("connected:") ? `Connected ${notice.slice("connected:".length)}` : notice;
  return <AppShell activeNav="settings"><main className="dashboard">
    <header className="dashboard-header"><div><p className="eyebrow">SAGE · OPERATIONS</p><h1>Settings</h1></div><SignOutButton redirectUrl="/sign-in"><button className="quiet-button">Sign out</button></SignOutButton></header>
    {connectedNotice && <p className="notice-banner" role="status">{connectedNotice}</p>}
    <div className="dashboard-grid">
      <section className="dashboard-panel" aria-labelledby="google-title">
        <p className="eyebrow">01 / GOOGLE</p><h2 id="google-title">Studio document access</h2>
        <p className="muted">One dedicated Google account (normally studio@poweredbysage.com) grants read-only Drive access for every live source. Clients share their documents with that account; no client credentials are ever stored.</p>
        {google.connected ? <>
          <dl className="settings-facts">
            <div><dt>Connected account</dt><dd>{google.accountEmail}</dd></div>
            <div><dt>Connected</dt><dd>{timestamp(google.connectedAt)}</dd></div>
            <div><dt>Last token refresh</dt><dd>{timestamp(google.lastRefreshAt)}</dd></div>
            <div><dt>Scopes</dt><dd>{google.scopes}</dd></div>
            {google.lastError && <div><dt>Last error</dt><dd>{google.lastError}</dd></div>}
          </dl>
          <div className="batch-actions">
            <a className="export-link" href="/api/google/oauth/start">Reconnect →</a>
            <form action={disconnectGoogle}><button type="submit" className="quiet-button danger">Disconnect and revoke</button></form>
          </div>
        </> : <>
          <p className="muted">No account connected. Sign in as the studio account in the next step; its refresh token is stored encrypted server-side and is never shown to the browser.</p>
          <a className="export-link" href="/api/google/oauth/start">Connect studio Google account →</a>
        </>}
      </section>
      <section className="dashboard-panel" aria-labelledby="ai-title">
        <p className="eyebrow">02 / EXTRACTION</p><h2 id="ai-title">AI extraction</h2>
        {engine.aiConfigured
          ? <p className="muted">Claude extraction is active (model: {engine.model}). Every extracted field keeps a verbatim source snippet and must be approved before it enters the master.</p>
          : <p className="muted">No ANTHROPIC_API_KEY is configured on the Convex deployment, so the deterministic line parser is in use. Set the key to enable AI extraction for arbitrary document formats.</p>}
        <dl className="settings-facts">
          <div><dt>Engine</dt><dd>{engine.aiConfigured ? "Claude (Anthropic API)" : "Deterministic line parser"}</dd></div>
          <div><dt>Model</dt><dd>{engine.model}</dd></div>
          <div><dt>Signed in as</dt><dd>{email ?? "—"}</dd></div>
        </dl>
      </section>
    </div>
    <p className="dashboard-note">Access control: sign-in is restricted by the ALLOWED_SIGNIN_EMAILS / ALLOWED_SIGNIN_DOMAINS environment configuration on the Convex deployment.</p>
  </main></AppShell>;
}
