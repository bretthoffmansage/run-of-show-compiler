# WP-02 expansion log

- **Date/branch:** 2026-10-28, `forge/run-of-show-compiler`.
- **Original broader intent:** Full sign-in, organization/event CRUD, roles and tenant authorization.
- **Why expandable now:** WP-01 delivered the Next.js and test baseline (`e183093`); no tenant-bearing app data exists yet, so authorization can be defined before storage. PRD-01–03/19 and R2 make server-side boundaries mandatory; audit identifies complete absence of auth. Prior run log confirms no backend/provider touched.
- **Narrowing:** First considered real SAGE login + CRUD; rejected because provider and persistence are unresolved (AMB-01/03) and would force a speculative vendor/data platform. Narrowed to a server-only, pure authorization contract with a fail-closed identity gate and synthetic fixture tests. This is the first safe executable level: real access decisions can be proved without a public route or client data.
- **Explicitly deferred:** Provider/session verification, persistent membership, org/event CRUD/UI, all source features. These stay scheduled under PRD-01–03 and later WP-03/R8; no fake authenticated state.
- **Prior systems to preserve:** WP-01 route, build/type/lint/test scripts and clean package boundary.
- **Safety:** No provider credentials, real data or backend migration. Contract must deny absent/untrusted identity and never accept a browser-supplied principal as proof of authentication.
- **Expansion result:** WP-02 rewritten ready, with exact scope/checks and no human approval for local contracts. Return automatically to executor; execute now, then separate package closeout commit and clean-tree check.
