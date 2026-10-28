"use client";

import Link from "next/link";

export default function EventError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="access-screen"><section className="access-card" role="alert"><p className="eyebrow">EVENT WORKSPACE</p><h1>Could not load this event</h1><p>Check that the local Convex backend is running and your operator session is still valid. No changes were applied by this page load.</p><div className="proposal-actions"><button type="button" onClick={reset}>Try again</button><Link className="back-link" href="/">Back to events</Link></div></section></main>;
}
