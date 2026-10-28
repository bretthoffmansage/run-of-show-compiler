# RELEASE_READINESS_AUDIT — WP-10 local-preview acceptance

**Date:** 2026-10-28. **Target:** operator-approved local single-operator/manual-text preview, **not** the original live-integrations MVP or production launch. The operator waived an external IdP and explicitly approved deferring live Google sync, AI extraction, uploads, cloud deployment, and production retention/export decisions. This audit preserves those original PRD gaps rather than treating them as implemented.

## Verified local evidence

- App-owned high-entropy access code, scrypt hash, RS256 signed eight-hour HttpOnly/SameSite cookie, server-side verification, and Convex custom-JWT authentication; secret files ignored and mode 0600. Convex queries/mutations still enforce organization/event membership. No unauthenticated event content or export: HTTP smoke observed unauthenticated event redirect and export 401; authenticated dashboard/event/export returned 200.
- Anonymous loopback Convex functions pushed. Synthetic organization/event/manual source created against that backend; deterministic proposals generated (4 fields), explicit approval created revision 1; other fields remained pending. Static source state is not mislabeled live. Export returned HTML from the approved revision only. Synthetic local data only; no client/production data touched.
- `npm run typecheck`, `npm run lint`, `npm test` (12 files, 32 tests), `npm run build` pass. `npm audit --audit-level=high` reported 0 high/critical at check time. Tests include auth signature/hash, cross-tenant restrictions, manual capture/proposal/approval, provenance, injection fixture, and regression foundations.
- No Google OAuth client, AI credential, production backend/Vercel project or Git remote was configured or validated. No measured freshness, AI accuracy, hosted reliability, production security, or official output claim.

## Raw PRD §12 acceptance matrix

| # | Original criterion | Narrowed local evidence | Disposition |
|---:|---|---|---|
| 1 | Org/event create/select and isolation | Authenticated dashboard, event routes, protected Convex functions and cross-tenant tests | **Met for one local operator; multi-user deferred** |
| 2 | Multiple live/static sources, provider and sync status | Multiple manual static sources with preview; Google metadata remains not connected | **Partial; live sync deferred** |
| 3 | Google access without password / missing-access message | Mock read-only adapter only, no OAuth | **Deferred by operator** |
| 4 | Initial/later snapshot and diff | Manual initial capture, backend manual revisions and fixture diff; no live fetch | **Partial; live monitoring deferred** |
| 5 | Changed source yields reviewable diff without silent approved mutation | Manual snapshot proposals and approval ledger; no live change pipeline | **Partial; live processing deferred** |
| 6 | Field-level source/revision provenance | Proposal evidence and approved fields carry snapshot; event UI shows source/revision | **Met in manual flow** |
| 7 | Conflict values side by side, unresolved | Proposed vs approved side-by-side, per-field approve/reject; cross-source matching/keep-variants absent | **Partial; richer conflict policy deferred** |
| 8 | No invented times; unplaced sequence | Fixture timeline/compiler tests; manual parser only proposes explicit prefix, absent time remains absent | **Met in narrow manual flow; rich time rules deferred** |
| 9 | Two-pane workspace and context | Protected responsive event route with source/master panes and org/event navigation | **Met locally** |
| 10 | Approve/reject/edit/history/export approved version | Protected UI/forms, immutable revisions, decision count, approved HTML download | **Met locally; official export decision deferred** |
| 11 | Outage/parse/missed update/expired auth with last good | Error contracts and fixture snapshot tests; no live connector | **Deferred with live integration** |
| 12 | Source prompt injection cannot override security | Strict extraction contract fixture and manual text handled as inert proposals, no model/tools | **Met for local path; live AI threat test deferred** |

## Remaining external setup / original PRD gaps

- **PRD-01–02:** SAGE IdP and multi-user roles remain deferred. This release has one locally managed operator identity, not team sign-in.
- **PRD-04/07–09/16/18/20:** Google OAuth account/scopes/client, token vault, real Docs/Sheets read and monitored revisions, failure/retry/freshness evidence, uploads, and real AI provider/extraction jobs are not implemented live. Mock adapters/contracts are not live connections.
- **PRD-10–13/21:** Full time-zone/DST and persistent rules, cross-source match/conflict policy, batch/keep-variants review, representative source accuracy and production export format remain deferred. HTML download is provisional.
- **PRD-17/19:** Cloud backend/hosting, secret architecture, retention/deletion, production security/privacy and reliability approval are unverified. Local data is not a production data store. No Git remote or Vercel deployment.
- **PRD-15:** Reference imagery/sample files in raw §14 were not provided. Automated tests/build and HTTP smoke do not substitute for full visual/browser/accessibility validation.
- **PRD-22** remains post-MVP; **PRD-23** non-goals remain excluded. No material original requirement is unaccounted for: each is implemented in the narrowed flow, partially implemented, explicitly deferred, or excluded above.

**Decision:** The approved local preview is ready for shell closeout **only as a caveated local release** after WP-10 commit/clean tree. It is not ready for production or the original full PRD acceptance.
