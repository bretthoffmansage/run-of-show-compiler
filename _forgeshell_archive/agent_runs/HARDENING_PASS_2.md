# Hardening pass 2 — validation tooling

Added `npm run check:local` to run repo-safety, typecheck, lint, tests and build without live-provider credentials. `scripts/check-repo-safety.mjs` refuses tracked local secret/backend/build paths and flags incidental `next-env.d.ts` drift; it does not read secret values. `LOCAL_OPERATOR_SETUP.md` now points to the check. Validation: command passed (12 files/32 tests, build); audit remains separate and network-dependent. No remote or CI deployment configured. Commit separately and verify clean tree.
