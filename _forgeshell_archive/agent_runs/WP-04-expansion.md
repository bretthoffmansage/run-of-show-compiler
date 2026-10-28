# WP-04 expansion log

- **Date/branch:** 2026-10-28, `forge/run-of-show-compiler`.
- **Why now/evidence:** WP-03 delivered local Convex source metadata and scoped functions (`378742b`); R4 and PRD-05/07–08/16/19–20 require immutable source revisions before AI. Audit originally found none. WP-03 log confirms local-only backend and no token/content storage yet.
- **Original breadth:** File upload/parser, snapshots, change detection and provider sync in one unit. Too broad and requires file security/retention and provider choices not yet validated.
- **Narrowing attempts:** First considered upload plus snapshots; rejected due parser/size/retention questions (AMB-05). Then considered public paste-text endpoint; rejected because no live SAGE identity is configured and it would expose client-content writes. Selected internal fixture-only snapshot mutation plus authorized read/diff. This is first safe executable slice: revision, provenance and idempotency can be validated without real client data.
- **Deferred:** Actual file upload (conditional PRD-07), Google fetch/notifications/polling, AI and master changes. Keep upload explicit for WP-10 release gate or post-MVP rationale; no false claim of support. Production content retention/encryption remains a release blocker.
- **Safety/regressions:** Local anonymous Convex only, synthetic small text, internal write function, no source-client mutation. Preserve WP-01–03 checks. Expansion successful; package ready and control returns to executor now. Separate closeout required.
