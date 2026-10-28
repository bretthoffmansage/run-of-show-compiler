export function AccessGate({ denied = false }: { denied?: boolean }) {
  return <main className="access-screen">
    <section className="access-card" aria-labelledby="access-title">
      <p className="eyebrow">SAGE · OPERATIONS</p>
      <h1 id="access-title">Run of Show Compiler</h1>
      <p>Single-operator workspace. Enter the locally configured access code to open event records.</p>
      {denied && <p role="alert" className="error-message">Access code not accepted.</p>}
      <form action="/api/access" method="post">
        <label htmlFor="access-code">Access code</label>
        <input id="access-code" name="code" type="password" autoComplete="current-password" required />
        <button type="submit">Open workspace</button>
      </form>
      <small>No external identity provider is used. This access mode is for a trusted single operator.</small>
    </section>
  </main>;
}
