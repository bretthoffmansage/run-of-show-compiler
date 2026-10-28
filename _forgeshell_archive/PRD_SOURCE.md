# PRD_SOURCE — Run of Show Compiler

## Document purpose and source

Operational normalization of `raw_prd/Run_of_Show_Compiler_PRD.md` (sections 1–14). The raw PRD remains authoritative where this summary is less specific. Requirement IDs below are stable planning anchors; they do not imply implementation is complete.

## Project identity and strategic principles

**Product:** Internal SAGE operations web application that turns multiple client-owned event documents into a chronological, reviewable run of show. **Hierarchy:** Organization → Event. Each event owns its sources, rules, snapshots, proposals, approved master revisions, and audit trail. The app complements, not replaces or edits, client source systems. [Raw §§1–4]

- **SP-01 — Operator control:** AI proposes; an operator approves the official master. Uncertain or conflicting interpretations never silently overwrite it. [Raw §§1, 3, 6, 7.4–7.5]
- **SP-02 — Provenance:** Every derived field retains source excerpt/revision references; manual values are identified separately. [Raw §§3, 7.3–7.5, 12]
- **SP-03 — Honest freshness:** Distinguish live connections from uploads, surface latency, failures, and stale snapshots. [Raw §§3, 7.2–7.3]
- **SP-04 — Isolation and least privilege:** Server-side organization/event authorization; secrets stay server-side; source documents are untrusted data. [Raw §§5, 7.7]
- **SP-05 — Small operations console:** A focused, accessible dark UI with organization/event selectors and source/master split workspace. [Raw §§7.1, 7.5, 8]

## Core users and permissions

- **PRD-01 — Roles and access.** Organization administrators manage organizations, events, members, approved connections, and defaults. Event operators manage inputs/rules, review/edit/approve/export master revisions. Viewers read without mutating. Initial single-team simplification is allowed, but every server action/query/job/callback must enforce organization/event scope. [Raw §§5, 7.7, 12.1]
- **PRD-02 — Identity.** Users sign in via the approved SAGE identity provider. Provider choice/configuration is unresolved; no unauthenticated production data access. [Raw §§6.1, 7.7]

## Canonical entities and source of truth

- **PRD-03 — Organization and event.** Authorized creation, selection, rename, archive; event data and navigation are scoped to the selected organization. Keep context visible. Focused event navigation: Overview, Sources, Master Run of Show, Rules, Change History. [Raw §§7.1, 8, 12.1, 12.9]
- **PRD-04 — Source records.** Multiple named sources per event with provider/type, live URL or file ID, connection and sync state, timestamps/revision, optional role/priority; actions to pause, reconnect, refresh, rename, remove. Removing never deletes the client's original. Validate pasted URL and access. [Raw §§7.2, 12.2–12.3]
- **PRD-05 — Source of truth boundary.** Client documents remain external originals. Immutable event snapshots and extracted items are app records; proposed and approved master revisions are distinct. Do not automatically write source documents or promote uncertain edits. [Raw §§4, 6, 7.3–7.5]
- **PRD-06 — Persistent concepts.** Organizations, events, memberships, source connections and revisions/snapshots, extracted items, merge proposals, rules, master revisions, approvals/exports, and audit events need distinct durable representations where implemented. [Raw §§7.3–7.7, 9]

## Core workflow

- **PRD-07 — Connect and preview.** Begin with Google Docs/Sheets; selected Google account must have access. Capture initial snapshot. Show sources as tabs in left pane with preview, metadata, status, and Open original link. Uploaded DOCX/XLSX/CSV/PDF are non-live when feasible. [Raw §§6.4–6.5, 7.2, 10]
- **PRD-08 — Change monitoring.** Use provider notifications where available plus scheduled polling/reconciliation, subject to actual quotas/platform limits. Initial target: begin processing within one minute of receipt; polling default at most five minutes if feasible. Record immutable snapshots, source diffs/logs, idempotent revision processing, retry states, last-good snapshot and visible staleness. Queue affected work where practical. [Raw §§7.3, 12.4, 12.11]
- **PRD-09 — Extraction.** Treat source text strictly as data, never as instructions. Extract dates/times/durations/time zone, titles/types, people/audience, copy/cues/media/notes, order/dependencies, and other useful details without a fixed template. Keep original labels/text and unmatched details with provenance. Validate structured model output; persist model/version/timestamp. [Raw §§7.4, 7.7, 9, 12.6, 12.12]
- **PRD-10 — Time and matching.** Normalize while preserving original display/time zone; flag missing zones, ambiguous dates, duration mismatch and impossible chronology. Order by configured event time zone/day/tie rules; preserve intentional sequence for equal/missing times and never invent times. Match possible duplicates using multiple signals; title similarity alone is insufficient. [Raw §§7.4, 12.8]
- **PRD-11 — Conflict and proposal review.** Show conflicting values side by side with sources; support choose, keep variants, or unresolved. Distinguish inferred from exact values and rate confidence. Show new/changed/removed/conflict/needs-review/approved states, prior/proposed diff, source/revision/timestamp/reason. Accept/reject individually or in batch; low-confidence/conflicting items require explicit review. [Raw §§7.4–7.5, 12.5, 12.7, 12.10]
- **PRD-12 — Approved master and export.** Manual edits retain separate authorship/audit trail. Approved revision remains stable during re-extraction; each approval/export is versioned and auditable. MVP needs a practical approved-master export (DOCX and/or XLSX or another selected format); Google Doc write-back is release-gated, destination-confirmed, labeled, and recoverable. [Raw §§6.7–6.9, 7.5, 10, 12.10]
- **PRD-13 — Rules.** Configure event time zone/days, source authority (including optional per-field), output fields/layout, change/conflict rendering, poll interval, and AI processing settings outside client content. Rule changes trigger reviewable re-extraction without mutating approved master. [Raw §§7.4, 7.6]

## Product surfaces and interface

- **PRD-14 — Workspace.** Desktop two-pane source/master layout with independent scrolling where possible; source tabs left, chronological master right; compact mobile reading/review; visible context, source vs master distinction, status/provenance and review controls. [Raw §§7.5, 8]
- **PRD-15 — Accessibility/design.** Dark neutral operations-console style inspired by EventGFX and Home.png descriptions, not copied unrelated features. Keyboard navigation, visible focus, semantic headings, contrast, responsive behavior. Reference images were not present in this repo at intake; use text description until supplied. [Raw §§8, 14]
- **PRD-16 — History and error surfaces.** Source and master change histories link proposals to source revisions; connection/parse/stale/access errors are actionable and visible. [Raw §§7.2–7.3, 7.7, 12.11]

## Architecture and non-functional requirements

- **PRD-17 — Stack and deployment.** Next.js on Vercel; GitHub-connected deployment intended. Convex is an option, not an irrevocable requirement: validate fit/limits for persistence, OAuth secrets, jobs, and change history before sole-backend adoption. Durable scheduled work must not rely on a permanently running process. [Raw §§1, 9, 10]
- **PRD-18 — Integrations.** Google Drive/Docs/Sheets OAuth with minimum necessary scopes, read-only client inputs by default, no Gmail password. Approved dedicated account or Workspace delegation pattern for `studio@poweredbysage.com` must be validated. Airtable follows provider/auth validation, not initial MVP. [Raw §§7.2, 7.7, 9–10, 13]
- **PRD-19 — Security/privacy.** Encrypt secrets and data using appropriate platform capabilities; do not expose tokens/content to browser, model prompts beyond necessary excerpts, logs, or exports. Defend against prompt injection, unsafe links/files/macros/formulas. Define snapshot/output/disconnect/log/AI retention and deletion before launch. Audit access, connection, approval, export, configuration. [Raw §§7.7, 12.12]
- **PRD-20 — Reliability.** Retry rate limits/outages/expired webhooks/missed events/partial extraction safely; preserve last-good snapshot; idempotency and truthful freshness. [Raw §§7.3, 7.7]
- **PRD-21 — Acceptance evidence.** Representative schedule grids, narrative scripts, mixed spreadsheets, missing times and conflicts must produce useful drafts with no fabricated facts. Validate tenant isolation, snapshots/diffs, provenance, review, export, stale/error and prompt-injection behavior. [Raw §§11–12]

## MVP, deferred, and out of scope

MVP includes PRD-01–21 insofar as required for the initial workflow; delivery may be staged in dependency-ordered packages, but incomplete requirements must remain visibly scheduled or explicitly deferred. [Raw §10]

- **PRD-22 — Later milestones:** Airtable connector; richer layout-preserving previews/extraction; fine-grained reusable rule templates and extra formats; team comments/assignments/notifications; further connectors. [Raw §10]
- **PRD-23 — Explicit non-goals:** No client-source replacement or automatic editing, universal zero-config ingestion, unapproved publishing, unnecessary live collaborative editor, or EventGFX graphics/attendance/timer/ticketing. [Raw §4]

## Integration readiness at intake

| Integration | Current posture | Reason / required follow-up |
|---|---|---|
| SAGE identity provider | Scaffold only; user setup after build | Provider and credentials not specified; enforce server-side contract before production use. |
| Google OAuth/Drive/Docs/Sheets | Scaffold only; user setup after build | OAuth client, account model, scopes, notification behavior, quotas, and live test access absent. |
| AI model provider | Scaffold only; user setup after build | Provider/key unspecified; define server-only interface, schema, and safe test fixtures. |
| Convex | Candidate; validate before adoption | Not mandated as sole backend; production project/config absent. |
| Vercel/GitHub deployment | User setup after build | No remote or deployment project specified; never claim deployment from local code. |
| Airtable | Intentionally deferred | Post-MVP connector. |

No integration is a Phase A blocker; production acceptance will require real configuration and verification. [Raw §§9–10, 13]

## Known ambiguities / decisions to validate

- **AMB-01:** Exact SAGE identity provider and organization membership provisioning.
- **AMB-02:** Google account/Workspace authorization model, scopes, webhook renewal/quota details.
- **AMB-03:** Convex suitability versus alternative persistent/job architecture.
- **AMB-04:** Official initial export target and whether Google Doc write-back ships.
- **AMB-05:** Upload limits, supported fidelity, retention/deletion periods, and rollout source mix.
- **AMB-06:** Expected team size and simultaneous editing needs.
- **AMB-07:** Original UI images and three sample files described in raw §14 are not in this workspace; no claims about their precise visuals/content beyond the PRD's description.

These are not license to fake live integrations. Use safe scaffolding/fixtures and surface later gates. [Raw §13]

## Operator scope override — 2026-10-28

The operator explicitly requested finishing **without an external identity provider**. For the initial single-operator release, PRD-01/02's SAGE IdP integration is intentionally deferred. Server-side access control and organization/event isolation are **not** waived: use a locally managed access-code session and deny access until configured. This is an operator-directed scope change, not a claim that the original PRD's multi-user roles or SAGE sign-in were implemented. Real production secrets, Google OAuth, AI service, cloud deployment, and retention decisions remain separately gated; this override does not waive them.

The operator subsequently confirmed **yes** to an explicit narrowed-release question: finish a **local single-operator, manual-text workflow** and defer live Google sync, AI extraction, uploads, cloud deployment, and production retention/export decisions. The narrowed release is an internal local preview, not the original full MVP or a production launch. The deferred PRD-07–09/17–20 items remain visible in release and final artifacts; no live freshness, model accuracy, or cloud security claims are authorized. Local approved HTML download is provisional.

## Canonical implementation bias and quick map

Prioritize PRD-01/03/05/19 for boundaries; PRD-07–13 for the core source-to-approved-master lifecycle; PRD-14/15 for presentation. Prefer a thin, verifiable vertical slice with honest status over a polished but fictional connection. Keep all material requirements traceable to a package, explicit deferment, or recorded ambiguity.
