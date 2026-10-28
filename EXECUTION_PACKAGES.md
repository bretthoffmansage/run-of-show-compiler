# EXECUTION_PACKAGES — Run of Show Compiler

## Execution contract

Packages run strictly in order. Only **WP-01** is ready now; later packages are intentionally draft and must be expanded **one at a time** under `shell/control/PACKAGE_EXPANSION_PROTOCOL.md` immediately before execution. A draft is not permission to skip its PRD commitments. Every completed package requires its own evidence-bearing run log, relevant validation, diff/stat review, generated-drift cleanup, commit, and clean-tree check. Provider-dependent acceptance remains gated until actual configured environments exist. Current state: no product application (`CURRENT_STATE_AUDIT.md`).

## WP-01 — Minimal application and validation baseline

- **Status:** complete
- **Purpose / why now:** Establish an actual Next.js product entry point and repeatable checks before any tenant or provider work. R1; PRD-14, PRD-15, PRD-17.
- **Scope:** Minimal Next.js/TypeScript app in this root, accessible placeholder page identifying the Run of Show Compiler and honestly stating that sources/master require setup; package scripts for build, type, lint and test; one small smoke test; no sample client data. Keep ForgeShell control files intact.
- **Out of scope:** Auth, organizations/events CRUD, database, live integrations, AI, simulated populated master, full design pass.
- **Preconditions:** Clean committed shell baseline, isolated branch, no product app; package manager/network available.
- **Likely files/systems:** `package.json`, lockfile, `app/`, `tsconfig.json`, framework config, tests, `.gitignore` if necessary.
- **Sensitive systems:** Framework/config; no backend data.
- **Allowed / forbidden:** Install normal app dependencies and edit in-scope files; do not add remote, credentials, fake live status, or touch client documents.
- **Required checks:** Install succeeds; build, typecheck, lint, and smoke test pass; rendered route clearly labeled as setup-stage.
- **Regression checks:** Shell files and raw PRD untouched; Git status clean after closeout.
- **Done/evidence:** Run log records versions/commands/results, source anchors, diff classification and commit hash.

## WP-02 — Identity and tenant boundary

- **Status:** complete (expanded from draft on 2026-10-28).
- **Priority:** 2, next in strict sequence.
- **Depends on / blocks:** Depends on completed WP-01; blocks WP-03 source ownership and all future server data access.
- **Human approval required:** No for local code/contracts; yes before any real SAGE provider or production credential configuration (not in this slice).
- **Data migration involved:** No. No database exists yet.
- **Purpose / why now:** Establish the first enforceable tenant authorization contract before any durable client data exists. R2; PRD-01–03, PRD-19; current-state audit says identity and data model are absent.
- **Minimum promise / scope:** Server-only typed principal, organization membership and event ownership access functions; deny by default when identity/membership missing; role-specific read/edit/admin decisions; an explicit server-side `identity not configured` gate. Test these against synthetic records for cross-tenant denial and role boundaries. The existing page remains an honest unconfigured preview. This is a foundational authorization slice, not complete sign-in or org/event CRUD.
- **Out of scope / deferred:** Real SAGE identity provider and session verification (AMB-01), persistence decision/model (AMB-03; WP-03), organization/event create/select UI and CRUD (to follow alongside persistence and actual identity), sources, sync, AI, export, production credentials. These PRD-01–03 commitments remain **scheduled**, not counted complete by this package.
- **Preconditions:** WP-01 committed and clean; no backend or production environment targeted.
- **Likely files/systems:** `lib/tenant-access.ts`, `lib/identity-gate.ts`, `tests/tenant-access.test.ts`, package status/run log.
- **Sensitive systems:** Authorization contract and tenant boundary; do not wire a fixture principal into public routes.
- **Allowed actions:** Add pure server-only access functions and fixture tests; run local checks.
- **Forbidden actions:** Public unauthenticated CRUD, fake production login, hard-coded operator identity in runtime, arbitrary provider choice, production data writes.
- **Required checks:** Typecheck, lint, unit tests showing absent principal, non-member, wrong organization/event, viewer write denial, operator/admin boundaries; production build.
- **Regression checks:** WP-01 home smoke test and static route build remain passing; no provider/data state altered.
- **Definition of done:** A caller cannot read or mutate a tenant/event through the contract without explicit matching membership/role; unconfigured identity gate fails closed; all checks pass; this **does not** claim real authentication is finished.
- **Completion evidence:** Separate expansion and execution logs, passing command results, diff/stat classification, package-specific commit, clean tree.
- **Notes for future package expansion:** WP-03 must choose persistence and attach **verified** server principal/session to this boundary before exposing CRUD or source data; identity provider setup remains a release gate. Return to executor immediately after this expansion.

## WP-03 — Durable event/source model and source library

- **Status:** complete (expanded from draft on 2026-10-28).
- **Priority:** 3; depends on completed WP-02; blocks WP-04 snapshots and later source processing.
- **Human approval required:** No for local development; yes before production backend/provider setup. **Data migration involved:** Additive new schema only; no existing product data.
- **Purpose / why now / anchors:** R3; PRD-03–07, PRD-16–19; the audit found no database or source model. Source ownership and truthful status must precede ingestion.
- **Minimum executable scope:** Adopt Convex for *nonsecret* organization/event/source metadata in an isolated anonymous **local development** deployment, not as an irrevocable sole backend. Add schema and authenticated functions for organization creation/list, event creation/list and source metadata create/list/rename/pause/remove. Every function derives identity from `ctx.auth`, enforces membership + event ownership, and fails closed. Google Docs/Sheets URLs may be validated as metadata but remain **not connected** until OAuth/sync exists. Add fixture-backed Convex function tests for success, role and cross-tenant denial. Document retention/deletion as unresolved release gate rather than claiming a policy.
- **Out of scope / deferred:** Actual SAGE login/provider configuration (AMB-01), source content/credential storage, OAuth, uploads, live sync, snapshots (WP-04/05), production migration/deployment, full source UI; no live label or client-document deletion. Source metadata is not a connected source.
- **Preconditions:** WP-02 commit and clean tree; local Convex target verified before backend command; no production endpoint or deploy key used.
- **Likely files/systems:** `convex/schema.ts`, protected Convex functions/helper, `convex/_generated/`, `convex/*.test.ts`, package scripts/config, `.gitignore` for local state, this package/log.
- **Sensitive systems:** Schema, auth/tenant enforcement, local backend config; no OAuth tokens stored.
- **Allowed / forbidden:** `convex dev --once` against anonymous local deployment and fixture tests; no production push, credential logging, destructive migrations or token storage.
- **Required checks:** Convex codegen/local push, typecheck, lint, tests for create/list/source actions and cross-tenant/role denial, build.
- **Regression checks:** WP-01 page and WP-02 access tests; no changes to original PRD/shell baseline.
- **Definition of done / evidence:** Durable local metadata schema/functions verified; all publicly callable functions fail without auth and enforce membership; source status honestly indicates not connected; commands, limitations, diff/commit and clean tree logged.
- **Notes for future expansion:** WP-04 adds immutable snapshots; WP-05 must validate provider scopes/quotas and token storage before calling any source live. Real identity integration and production backend fit remain release gates. Return to executor automatically now.

## WP-04 — Upload intake and immutable snapshots

- **Status:** complete (expanded from draft on 2026-10-28).
- **Priority:** 4; depends on WP-03; blocks WP-05/06 revision-anchored ingestion/extraction.
- **Human approval required:** No for local fixtures; yes before any real client file import. **Data migration:** Additive new snapshot schema only; local development data only.
- **Purpose / anchors:** R4; PRD-05, 07–08, 16, 19–20. Stored source metadata now exists, but extraction needs immutable revision evidence and a last-good fallback.
- **Minimum executable scope:** Local-only, **internal** fixture snapshot intake for an existing source (no public upload endpoint), with bounded UTF-8 text and explicit revision ID; at most one snapshot per source+revision; immutable content and timestamps; simple reviewable line-level diff/summary and source revision list. Authorized event viewers may read snapshots/diffs. A failed/unreachable source does not delete prior snapshot. Test duplicate, change, no access and last-good behavior. This makes revision mechanics real without ingesting client files or claiming a live connector.
- **Out of scope / deferred:** DOCX/XLSX/CSV/PDF upload/parser and actual Google fetch, provider notifications/polling, AI, master proposals. Uploaded file support remains PRD-07 conditional work to revisit in WP-10 release validation or explicit post-MVP deferment with rationale; do not treat this snapshot slice as upload completion.
- **Preconditions:** WP-03 committed clean; only isolated anonymous local Convex and synthetic test content. No external backend/data target.
- **Likely files/systems:** `convex/schema.ts`, snapshot functions, pure diff utility and tests, generated Convex API/types.
- **Sensitive systems:** Source content persistence and schema. Keep fixture text small and never log it; production retention/encryption/deletion policy is AMB-05 release gate.
- **Allowed / forbidden:** Additive local schema, internal mutation, authorized read functions, tests; no public source-content writes, destructive cleanup, client file execution or production deployment.
- **Required checks:** Convex local push/codegen, typecheck, lint, tests for initial/later snapshot, idempotency, immutable prior content, diff, unauthorized read and last-good on error; build.
- **Regression checks:** WP-01 page, WP-02 access and WP-03 metadata tests; clean tree after separate commit.
- **Done/evidence:** Snapshot/revision/diff flows verified with fixtures only; status still honest (`not_connected`); limits/deferrals logged, commit and clean tree.
- **Future expansion:** WP-05 connects real provider revisions, WP-06 consumes provenance; upload implementation/gate remains visible under PRD-07. Return immediately to executor.

## WP-05 — Google connection and reconciliation slice

- **Status:** draft; expand after WP-04.
- **Purpose / why now:** Core live source requirement depends on access and revisions. R4/R8; PRD-07–08, PRD-18, PRD-20.
- **Scope candidate:** OAuth/provider adapter and Docs/Sheets reads with least privilege, access/error states; polling/notification and renewal design with idempotent revision handling. If credentials are unavailable, implement/test contracts and record a live-acceptance gate, not a fake connected state.
- **Out of scope:** Source write-back, Airtable, unsupported latency claims.
- **Preconditions:** Tenant/auth/storage boundaries; validate AMB-02 and current provider/platform limits before choosing trigger design.
- **Likely files/systems:** OAuth callbacks, provider adapter, scheduled jobs, secrets config, fixtures.
- **Sensitive systems:** OAuth tokens, tenant callbacks, scheduled work.
- **Allowed / forbidden:** Dev/test account only when explicitly safe; no passwords, browser tokens, broad scopes, or production resets.
- **Required checks / regression:** Build/type/lint/test; adapter, retry/idempotency, token-handling and stale-state tests; prior snapshot/access tests; live checks only if configured.
- **Done/evidence:** Accurate supported live path or clearly gated scaffold, latency/quota caveats and security review in log.

## WP-06 — Extraction contract and provenance

- **Status:** draft; expand after WP-04/05 source revision path.
- **Purpose / why now:** Normalize data safely before merge. R5; PRD-09, PRD-19, PRD-21.
- **Scope candidate:** Server-only provider-agnostic AI interface, schema validation, minimum excerpts, source/revision per-field references, original labels/additional details, model/version/timestamp; fixture-based prompt-injection tests.
- **Out of scope:** Autonomous approval, unrestricted tool use, claiming model accuracy without representative tests.
- **Preconditions:** Snapshot/revision contract; provider credentials optional via fixture mode.
- **Likely files/systems:** Extraction service, schema, jobs, fixture corpus/tests.
- **Sensitive systems:** Model prompts, client content, secrets, persistence.
- **Allowed / forbidden:** Bounded dev fixtures; never let document text alter app instructions, permissions, tools or logs.
- **Required checks / regression:** Build/type/lint/test; malicious text, invalid schema, provenance and missing-detail tests; earlier source/access tests.
- **Done/evidence:** Structured extraction with complete field references and security caveats logged.

## WP-07 — Timeline, matching and rules

- **Status:** draft; expand after WP-06.
- **Purpose / why now:** Build deterministic compilation before review. R5; PRD-10, PRD-13, PRD-21.
- **Scope candidate:** Time zone/day rules, unplaced/equal-time sequencing, chronology warnings, evidence-based duplicate candidates, source authority and rerun behavior.
- **Out of scope:** Invented times, title-only merge, silent approved-master changes.
- **Preconditions:** Validated extracted records and event ownership.
- **Likely files/systems:** Compilation/domain functions, event rules storage/UI, tests.
- **Sensitive systems:** Rules and master derivation.
- **Allowed / forbidden:** Pure deterministic functions/fixtures; do not mutate approved revisions.
- **Required checks / regression:** Build/type/lint/test; missing-time, ambiguous-zone, conflict/matching and rule-change tests; extraction/source/access tests.
- **Done/evidence:** Reviewable draft ordering with warnings and no fabricated facts.

## WP-08 — Conflict review and approval history

- **Status:** draft; expand after WP-07.
- **Purpose / why now:** Operator control defines the official master. R6; PRD-05, PRD-11–13, PRD-16, PRD-21.
- **Scope candidate:** Proposal/change states, prior/proposed/source diff, conflict/low-confidence gates, accept/reject/batch actions, manual authorship, immutable approved revisions and audit records.
- **Out of scope:** Automatic publishing or client-source edits.
- **Preconditions:** Compilation proposals and tenant authorization.
- **Likely files/systems:** Proposal/master schemas, server actions, review UI, tests.
- **Sensitive systems:** Approval authority, history, data migration.
- **Allowed / forbidden:** Safe dev data; never overwrite prior approved revision or auto-resolve guarded conflicts.
- **Required checks / regression:** Build/type/lint/test; approval/rejection/audit/immutability/tenant tests; all prior domain tests.
- **Done/evidence:** Operator can demonstrate review-to-approved lifecycle without silent promotion.

## WP-09 — Source/master workspace and approved export

- **Status:** draft; expand after WP-08.
- **Purpose / why now:** Present the real review flow and produce an operator-selected artifact. R7; PRD-12, PRD-14–15, PRD-21.
- **Scope candidate:** Accessible responsive source-tabs/master two-pane workspace, provenance inspection and practical downloadable approved-revision export; select format using current operational context (AMB-04). Google Doc write-back remains gated unless safe scopes/recovery are established.
- **Out of scope:** Unapproved publication, unrelated EventGFX features, full multiuser editor.
- **Preconditions:** Real source/master domain flow; source visuals only as PRD text until actual images available.
- **Likely files/systems:** Workspace components/styles, export service, accessibility tests.
- **Sensitive systems:** Exported client content, approvals.
- **Allowed / forbidden:** Render authorized records; never export an unapproved revision as official.
- **Required checks / regression:** Build/type/lint/test; keyboard/responsive and export/revision tests; prior approval/access checks.
- **Done/evidence:** Source vs master clear; approved export verified; limitations logged.

## WP-10 — Operational hardening and release validation

- **Status:** draft; expand after WP-09.
- **Purpose / why now:** Differentiate local feature completeness from production readiness. R8; PRD-17–21 and all raw §12 acceptance criteria.
- **Scope candidate:** Verify configured identity/Google/AI/backend/deployment as available, retries/observability, retention/deletion, rate limits and notification renewal; acceptance matrix against representative fixtures and actual provider where configured.
- **Out of scope:** Claiming deploy or live timing without evidence; adding deferred features.
- **Preconditions:** Prior package flow complete; credentials/environments confirmed before external or backend-affecting commands.
- **Likely files/systems:** Deployment config, jobs, docs, tests, security checks.
- **Sensitive systems:** Secrets, provider accounts, production data, retention.
- **Allowed / forbidden:** Read-only inspection by default; no production mutation/reset or secret logging.
- **Required checks / regression:** Build/type/lint/test; full acceptance matrix; configured live smoke and timing measurements only when safe/available.
- **Done/evidence:** Explicit pass/fail/not-configured matrix, no fabricated production readiness, release blockers documented.

## Explicit deferrals, exclusions and unresolved questions

- **Intentionally deferred:** PRD-22 (Airtable, enhanced previews/extraction, reusable advanced rules, collaboration/notifications, extra connectors). Google Doc write-back is release-gated under PRD-12/AMB-04 and may remain deferred if scope/recovery cannot be validated.
- **Explicitly out of scope:** PRD-23 non-goals, including client-source replacement/editing, unapproved publishing, universal zero-config import, unrelated EventGFX modules and unnecessary simultaneous editing.
- **Ambiguous / requires validation:** AMB-01–07 in `PRD_SOURCE.md`; each next package resolves only the decision it needs. Unavailable credentials/assets do not excuse silent omission.
- **Coverage:** PRD-01–21 map to WP-01–10 as cited; PRD-22 deferred and PRD-23 excluded. No material PRD requirement is considered implemented merely by this plan.
