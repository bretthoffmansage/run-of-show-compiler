# FIDELITY_UPLIFT_PLAN

**Target:** improve materially thin portions of the operator-approved local manual release identified in `POST_BUILD_FIDELITY_AUDIT.md`, without reviving the original live-integration scope. Raw PRD §§6–8 and normalized PRD-03/10/12/16 anchor the work.

## Bounded work items

1. **Context:** Authorized organization lookup and visible organization name in event workspace. Preserve event/tenant access checks and existing navigation.
2. **Chronology:** Show approved entry date as well as time; sort by explicit date/time, leaving missing time unplaced rather than inventing it. Preserve all source provenance.
3. **History:** Show each immutable master revision and decision with timestamp/actor; allow read-only expansion of revision fields. Do not mutate old revisions or add batch/AI behavior.

## Explicit exclusions and deferrals

No Google OAuth/sync, AI, uploads, cloud deployment, SAGE IdP, production export/retention, rich cross-source conflict resolution, or full time-zone/rules implementation. Those remain listed in the final audit and readiness matrix. No visual redesign here—Phase F owns composition/polish.

## Validation / re-audit

Add focused authorization/render checks, run `npm run check:local`, repeat local authenticated event/export HTTP smoke if backend available, then update `POST_BUILD_FIDELITY_AUDIT.md` with post-uplift status and residual deferrals. Commit the uplift as a distinct clean unit before Phase F.

## Execution outcome

All three bounded work items implemented and re-audited on 2026-10-28. No deferred integration was revived. Separate Phase E closeout commit and clean-tree verification required before Phase F.
