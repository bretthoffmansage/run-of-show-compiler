# MASTER_ROADMAP — Run of Show Compiler

## Objective and current-state reading

Transform a fresh ForgeShell workspace with no product app (see `CURRENT_STATE_AUDIT.md`) into a bounded, reviewable source-to-approved-master application. Every material PRD commitment is assigned below to a chapter, explicit deferment, or recorded ambiguity. A chapter is **planned**, not implemented. Scope and technical choices must be revalidated when its next package is expanded.

## Canonical product spine

Organization → Event → Source connection/upload → Immutable revision/snapshot → Extracted field with provenance → Merge proposal/conflict → Human review → Approved master revision → Export/audit. The client source is never rewritten by default; proposals cannot silently replace approval (PRD-03–13).

## Sequence and chapter outcomes

| Chapter | Why here / dependency | Outcome and PRD anchors | Verification gate |
|---|---|---|---|
| **R1 — Application foundation** | No app exists; establish executable regression baseline. | Next.js app, config boundaries, test/build pipeline, initial accessible navigation shell (PRD-14–15, 17). | Local build/type/lint/test pass; no fabricated product data. |
| **R2 — Identity, tenant and event core** | All data access needs trustworthy ownership. | Approved identity integration path, organization/event CRUD and role-aware server authorization; event context and focused navigation (PRD-01–03, 19). | Cross-tenant denial tests; production identity gate explicit if provider not configured. |
| **R3 — Durable event model and source library** | Sources need owner, state and revision storage before parsing. | Persistence/job architecture decision; source metadata/actions; live-vs-static/connection status; safe URL and upload intake; retention boundaries (PRD-04–07, 16–19). | Fixtures and access-isolation checks; no false live claims. |
| **R4 — Snapshots and sync** | Extraction must be anchored to immutable revisions. | Initial/later snapshots, source diff/change log, idempotency, retries, polling and push where feasible, truthful freshness/last-good state (PRD-05–08, 16, 20). | Changed-revision and outage tests; provider latency verified only in configured environment. |
| **R5 — Extraction and compilation** | Requires safe stored source revisions. | Provider-agnostic validated AI interface, prompt-injection boundary, normalized items, provenance, dates/times/sequence, duplicate evidence, event rules (PRD-09–10, 13, 19, 21). | Representative fixture tests with no invented time/facts. |
| **R6 — Review and approved master** | Proposals rely on extracted items; approval is a separate durable state. | Conflicts, change states/diffs, individual/batch decision, manual edits, immutable approved revisions, audit history (PRD-05, 11–13, 16, 21). | Conflict/low-confidence cannot auto-approve; prior approved revision preserved. |
| **R7 — Workspace and export** | Real data flows should precede polished presentation. | Source tabs/master split workspace, responsive and accessible review, versioned practical export (PRD-12, 14–15, 21). | Review flow keyboard/mobile checks and exported approved revision verification. |
| **R8 — Operational integration/release gates** | Only after local correctness. | Configure Google OAuth/account model and live Docs/Sheets, notifications/reconciliation, identity, AI, selected persistence and Vercel/GitHub; security/retention/observability validation (PRD-02, 07–09, 17–21). | Live acceptance criteria separately evidenced; missing operator credentials recorded, not faked. |

## Dependency and scope rules

- R1→R2 establishes app then tenant trust. R3→R4 establishes source storage then revisions. R5→R6→R7 establishes interpretation then review then export/UI. R8 validates and enables external operation; provider-backed slices may be safely developed earlier only after their security and data boundaries exist.
- Package execution remains narrow. A chapter may require multiple packages. Draft later packages are expanded one at a time using current code and prior evidence; no broad one-shot build.
- Local fixture-backed behavior is **not** equivalent to a live source or production-ready auth. All release-gated requirements remain visible until verified.
- Preserve client originals, approved master history, tenant boundaries, and provenance at every stage (SP-01–04).

## Coverage accounting

| Requirement range | Destination |
|---|---|
| PRD-01–03 | R2; identity provider setup/validation in R8 (AMB-01). |
| PRD-04–07 | R3; Google live configuration in R8 (AMB-02). |
| PRD-08 | R4; real provider latency/quotas in R8 (AMB-02). |
| PRD-09–10 | R5; model provider setup in R8. |
| PRD-11–13 | R5–R7; initial export selection remains AMB-04. |
| PRD-14–16 | R1/R3/R6/R7. |
| PRD-17–20 | R1/R3/R4/R5/R8; backend choice AMB-03, retention AMB-05. |
| PRD-21 | Each chapter's tests plus R8 acceptance matrix. |
| PRD-22 | Intentionally deferred to post-MVP: Airtable, richer extraction/previews, reusable fine-grained rules, team workflow, extra connectors. |
| PRD-23 | Explicitly out of scope: source replacement/editing, unapproved publishing, universal import, unrelated EventGFX features, unnecessary collaborative editor. |

## Unresolved decisions and release guardrails

AMB-01–07 remain as recorded in `PRD_SOURCE.md`. The planning default is scaffold/configure later when meaningful work is safe. Escalate only when a particular executable unit truly cannot progress without a decision. Do not claim deploy, live OAuth, one-minute processing, five-minute polling, or source-file fidelity until measured against actual providers and quotas.
