import { Workspace } from "./components/Workspace";

export default function Home() {
  return (
    <main className="shell">
      <aside className="rail" aria-label="Workspace context">
        <div className="brand">SAGE <span>· OPERATIONS</span></div>
        <div className="selector"><span className="eyebrow">Organization</span><strong>Not configured</strong></div>
        <div className="selector"><span className="eyebrow">Event</span><strong>No event selected</strong></div>
        <nav aria-label="Event sections">
          <span className="nav-label">Workspace</span>
          <span className="nav-item current" aria-current="page">Overview</span>
          <span className="nav-item disabled">Sources</span>
          <span className="nav-item disabled">Master Run of Show</span>
          <span className="nav-item disabled">Rules</span>
          <span className="nav-item disabled">Change History</span>
        </nav>
        <p className="rail-note">Setup stage · No live connections</p>
      </aside>
      <section className="content" aria-labelledby="page-title">
        <header className="topbar"><span>WORKSPACE / OVERVIEW</span><span className="status">NOT CONFIGURED</span></header>
        <div className="intro">
          <p className="eyebrow">Event operations</p>
          <h1 id="page-title">Run of Show Compiler</h1>
          <p>Bring event source documents into one reviewable timeline. Keep every proposed detail linked to its origin before an operator approves the official master.</p>
        </div>
        <Workspace sources={[]} entries={[]} />
        <footer>Foundation preview only · Sign-in, event data, compilation, review, and export are not implemented.</footer>
      </section>
    </main>
  );
}
