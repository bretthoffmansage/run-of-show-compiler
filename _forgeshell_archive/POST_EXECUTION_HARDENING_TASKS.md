# POST_EXECUTION_HARDENING_TASKS

Ordered passes derived from `POST_EXECUTION_HARDENING_PLAN.md`; these are hardening tasks, **not** a new feature roadmap.

## Pass 1 — Evidence and readiness clarification [documentation-only]
- Reconcile `FINAL_EXECUTION_AUDIT.md`, `RELEASE_READINESS_AUDIT.md`, `LOCAL_OPERATOR_SETUP.md` and WP-10 log; add a compact local-release evidence/setup checklist with explicit unverified original-PRD/production gates.
- Validate references and Git/no-secret status. Commit and clean tree.

## Pass 2 — Lint, tooling, and CI hardening [tooling/CI]
- Add one repeatable local check command for typecheck, lint, tests and build; verify it works from a clean checkout posture without live provider credentials. Keep audit a separate network-dependent command.
- Check secret/generated-file ignore patterns and verify no secret path is tracked; no remote or production CI deployment. Commit and clean tree.

## Pass 3 — Type-safety cleanup [code cleanup / backend boundary]
- Tighten untrusted form and route ID handling and auth/session error paths; ensure malformed input fails safely without exposing event data. Avoid broad type refactors.
- Add focused tests where meaningful; run baseline checks. Commit and clean tree.

## Pass 4 — Shell/route consistency and legacy containment [copy / resilience]
- Make empty/static/pending/master/export wording accurate for manual local release; confirm no Google/AI/live assertions leak into UI. Address only small route/error-state inconsistencies.
- Run regression and HTTP smoke on isolated local backend when available; record deferred original PRD gaps unchanged. Commit and clean tree.

No pass may silently revive deferred Google/AI/cloud/IdP/upload work. Phase E follows after all four passes close cleanly.
