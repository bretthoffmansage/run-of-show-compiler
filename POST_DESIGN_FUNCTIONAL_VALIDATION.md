# POST_DESIGN_FUNCTIONAL_VALIDATION

**Date:** 2026-10-28. **Target:** approved local single-operator/manual-text preview. Design scope and preservation lock: `DESIGN_DIRECTION_BRIEF.md`, `UI_REFINEMENT_PLAN.md`. Visual references from raw §14 were not present; browser screenshot/interactive accessibility testing was not available through the configured browser surface, so no pixel-perfect or full accessibility claim is made.

## What changed visually

- Authenticated dashboard and event route now share a persistent desktop left rail with brand, current organization/event context, primary navigation, and explicit local/static status. At widths ≤960px it becomes a compact horizontal context/nav strip.
- Additive `app/design.css` supplies a coherent dark slate/cyan token system, typography/spacing/surface hierarchy, legible controls, clear focus states, reduced-motion behavior and mobile comparison stacking. Source/master panes, raw source text, pending comparison and full read-only revision history remain present.
- Access gate styling remains coherent; no new product features or live-connector claims introduced.

## Functional preservation evidence

| Surface/workflow | Post-design result |
|---|---|
| `/` unauthenticated gate | HTTP 200; gate remains. Valid access code login 303, authenticated dashboard 200; sign-out 303 restored gate. |
| Organization/event context/navigation | Shared shell render test confirms context, event navigation and local status; authenticated event HTML showed organization name and shell. Existing create forms/links retained in JSX. |
| `/events/[eventId]` | Authenticated HTTP 200 with review/history/context markers; unauthenticated event redirected (307). Source tabs, raw preview, add-static-source form, individual approve/reject forms, manual title edit, export link and revision details retained. |
| Export/access | Authenticated approved export 200; unauthenticated export 401; malformed ID 404. No export formatter or backend behavior changed in design pass. |
| Data/API and permissions | No Convex schema/functions, server actions, auth or export-route code changed in Phase F. Existing regression tests include tenant denial/manual approval/provenance. |
| Error/loading | Existing event error boundary retained; no explicit loading route before or after design. Error messaging not hidden. |
| Search/filter | Not part of approved local release; none existed to preserve or invent. |

`npm run check:local` passed: repo safety, typecheck, lint, 15 test files/36 tests, production build. CSS was inspected for one-column/mobile and focus behavior. **Residual design validation:** no actual browser screenshot, keyboard walk-through, color-contrast measurement or assistive-technology test; do those before production or original-PRD acceptance. Original Google/AI/cloud/export/retention deferrals remain unchanged.
