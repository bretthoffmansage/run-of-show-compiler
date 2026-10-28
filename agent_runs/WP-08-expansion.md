# WP-08 expansion log

- **Date/branch:** 2026-10-28, `forge/run-of-show-compiler`.
- **Why now/evidence:** WP-07 deterministic draft is committed (`bc9fda0`); PRD-05/11–13/16/21 and R6 require explicit approval. Audit found no master or history. WP-04 provides immutable source snapshots and WP-03 tenant guard; no real auth/provider exists.
- **Original breadth:** Full field conflict UI, batch review, manual edits, master revisions, audit and live AI wiring. Too broad without real upstream workflow or identity.
- **Narrowing:** Chose internal single-field proposal intake and operator-only single decision that creates an immutable approved revision. Every proposal remains pending until explicit action; simple field-level prior/proposed is enough to prove boundary. This is the first safe meaningful level. Pure in-memory logic would not prove durable revision history; full UI/live provider would force unresolved choices.
- **Deferred:** Batch conflict review, polished UI, per-field authority, real source/AI orchestration, export/publication. Preserved as PRD-11–13 work for WP-09/10 or explicit release gate.
- **Safety/regression:** Additive local schema, synthetic data only, no production/backend secrets or original client file changes. Preserve WP-01–07 checks. Ready; return automatically to executor and close separately.
