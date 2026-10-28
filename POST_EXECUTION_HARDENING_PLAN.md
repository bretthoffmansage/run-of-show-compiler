# POST_EXECUTION_HARDENING_PLAN

**Baseline:** `FINAL_EXECUTION_AUDIT.md` records a complete **local-preview** package program with major operator-approved deferrals. Hardening exists to make that narrow release repeatable, safe, and reviewable—not to implement the original Google/AI/cloud feature set.

## Workstreams and order

1. **Evidence/readiness:** Reconcile release matrix, setup instructions and package claims; explicitly separate local proof from original PRD and production setup. No fixture-to-live inference.
2. **Tooling/validation:** Make the local validation baseline easy to repeat and fail clearly. Check no secrets/generated drift enter Git; avoid network/production side effects.
3. **Type/security boundaries:** Tighten high-traffic untrusted form/route inputs and session failure behavior without changing domain data or expanding access.
4. **Route/wording consistency:** Align empty, pending, error and static-source labels with the actual manual flow; preserve all approved actions and export behavior.

## Scope boundaries

Allowed: documentation, narrowly scoped validation scripts/tests, input validation and route resilience, copy/accessibility consistency. Forbidden: live provider credentials, production project/deployment, new data schema, Google polling, real AI, upload parser, speculative features, broad UI redesign (Phase F). Only anonymous loopback Convex may be used for runtime checks.

Each pass must record evidence, run affected tests plus baseline checks, inspect status/diff, commit separately, verify a clean tree, then auto-continue. Phase D feeds a truthful Phase E fidelity audit with all original PRD deferrals still visible.
