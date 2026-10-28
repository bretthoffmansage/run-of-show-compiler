# EXECUTION_PACKAGES — Run of Show Compiler

## Execution contract

Packages run strictly in order. Only **WP-01** is ready now; later packages are intentionally draft and must be expanded **one at a time** under `shell/control/PACKAGE_EXPANSION_PROTOCOL.md` immediately before execution. A draft is not permission to skip its PRD commitments. Every completed package requires its own evidence-bearing run log, relevant validation, diff/stat review, generated-drift cleanup, commit, and clean-tree check. Provider-dependent acceptance remains gated until actual configured environments exist. Current state: no product application (`CURRENT_STATE_AUDIT.md`).

## WP-01 — Minimal application and validation baseline

- **Status:** ready
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

- **Status:** draft; expand only after WP-01.
- **Purpose / why now:** All later data must have authenticated organization/event ownership. R2; PRD-01–03, PRD-19.
- **Scope candidate:** Select a safe, testable identity/provider boundary; organization/event membership and server authorization; minimal create/select UX. If actual SAGE identity is unavailable, narrow to contracts/fixtures and explicit deployment gate rather than pretending auth.
- **Out of scope:** Sources, sync, AI, export, production credential provisioning.
- **Preconditions:** WP-01 clean; resolve only decisions needed for the slice (AMB-01).
- **Likely files/systems:** Auth middleware/server functions, org/event models, routes, tests.
- **Sensitive systems:** Auth, tenant access, persistence choice.
- **Allowed / forbidden:** Narrow local implementation and automated isolation tests; never expose an unguarded production data path or write production data.
- **Required checks / regression:** Build/type/lint/test and cross-tenant denial checks; WP-01 smoke route remains valid.
- **Done/evidence:** Membership and server access behavior demonstrable; missing external provider setup explicit in log.

## WP-03 — Durable event/source model and source library

- **Status:** draft; expand after WP-02.
- **Purpose / why now:** Source ownership and lifecycle precede ingestion. R3; PRD-04–07, PRD-16–19.
- **Scope candidate:** Validate backend/storage fit (AMB-03), event-scoped source records, honest live/static statuses, source actions and URL validation, initial library UI; define retention/deletion policy before production.
- **Out of scope:** Claiming live Google connectivity, background sync, full file parser.
- **Preconditions:** WP-02 access boundary and clean closeout.
- **Likely files/systems:** Data schema/repositories, source actions/UI, tests, provider contract.
- **Sensitive systems:** Schema, storage, provider metadata, tenant boundary.
- **Allowed / forbidden:** Safe dev/test storage; no production mutation, token persistence without encryption review, or deleting client originals.
- **Required checks / regression:** Build/type/lint/test; source CRUD and tenant isolation; WP-02 auth tests.
- **Done/evidence:** Source metadata/actions and truthful state exercised with fixtures; architecture decision logged.

## WP-04 — Upload intake and immutable snapshots

- **Status:** draft; expand after WP-03.
- **Purpose / why now:** Extraction needs stable revision references. R3–R4; PRD-05–08, PRD-16, PRD-19–20.
- **Scope candidate:** Safe size/type-limited non-live upload path where feasible; immutable initial/later snapshots, revision identifiers, last-good fallback, source change log and diff, idempotency tests.
- **Out of scope:** Universal parsing, live provider notifications, master compilation.
- **Preconditions:** Durable source model and scoped storage.
- **Likely files/systems:** Upload endpoint, storage, snapshot schema/functions, diff tests.
- **Sensitive systems:** Client files, storage, schema, retention.
- **Allowed / forbidden:** Test fixtures and bounded parsers; never execute macros/formulas/embedded code or log sensitive content.
- **Required checks / regression:** Build/type/lint/test; duplicate revision, changed revision, inaccessible source/last-good tests; prior access checks.
- **Done/evidence:** Immutable snapshot/diff behavior and actual supported formats/limits documented.

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
