# WP-09 expansion log

- **Date/branch:** 2026-10-28, `forge/run-of-show-compiler`.
- **Why now/evidence:** WP-08 (`30ed0a5`) delivered approval revision ledger. PRD-12/14–15/21 and R7 need readable source/master separation and approved-only export. Audit found no product UI. Prior logs confirm identity/provider and output target AMB-04 unresolved.
- **Original breadth:** Full interactive two-pane workspace, provenance controls, download/export and Google write-back. Cannot safely expose tenant data without real SAGE identity or choose official format without AMB-04.
- **Narrowing:** Choose presentational component with honest unconfigured state and a server-use approved-revision HTML formatter. No public export route or fake event. This is the first safe executable slice: layout/escaping/approved-only rules can be validated, whereas an auth-wired UI would be unsafe and a CSS-only page would not prove data rendering.
- **Deferred:** Real data wiring, interactive controls, DOCX/XLSX/Google Doc destination, live accessibility testing and production export. These stay PRD-12/14–15 commitments at WP-10/Phase E/F or explicit release decision.
- **Safety/regression:** No backend/customer data or creds, no source write, escape export HTML. Preserve WP-01–08 tests. Ready; return to executor and close separately.
