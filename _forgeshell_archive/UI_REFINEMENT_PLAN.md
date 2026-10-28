# UI_REFINEMENT_PLAN

Derived from `DESIGN_DIRECTION_BRIEF.md`; visual/UX refinement only for the approved local preview. Do not alter backend, authentication, actions or accepted source/master semantics.

## Bounded implementation

1. **Shared system and app shell:** introduce a consistent desktop context rail and mobile context strip for authenticated dashboard/event routes. Keep organization/event selectors/forms in the main content reachable; rail links are supplemental. Define type, color, spacing, surface and focus tokens in an additive stylesheet rather than broad CSS churn.
2. **Home/dashboard:** strengthen sequential Organization → Event visual hierarchy, empty states and action prominence without removing the creation forms or lists.
3. **Event/detail-heavy surface:** distinguish static source preview, approved master, pending comparison and read-only history with restrained panel treatments. Preserve source tabs, raw preview text, provenance and expandable full revision fields.
4. **Responsive/accessibility:** one-column mobile layout, readable controls/touch targets, semantic navigation/focus, reduced-motion-safe effects. No new search/filter (not in this local release).

## Out of scope

Google/AI integrations, uploads, new product navigation/workflows, new data/API behavior, production deployment, replacing the provisional export format, decorative animation or hiding dense data.

## Validation

Run `npm run check:local`, local authenticated/unauthenticated route/export HTTP smoke, inspect labels and responsive CSS. Record unchanged routes/forms/data/permissions and any browser/visual testing limits in `POST_DESIGN_FUNCTIONAL_VALIDATION.md`. Commit this Phase F unit and verify clean tree before Phase H.

## Execution outcome

Shared context rail/mobile strip, additive design tokens/surface system, strengthened dashboard/event panel hierarchy, and semantic focus/responsive refinements completed on 2026-10-28. No schema, API, authentication or server-action change. Functional validation is in `POST_DESIGN_FUNCTIONAL_VALIDATION.md`.
