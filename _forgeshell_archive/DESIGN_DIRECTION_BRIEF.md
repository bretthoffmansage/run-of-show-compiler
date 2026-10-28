# DESIGN_DIRECTION_BRIEF — local operations console

**Phase F target:** the approved local manual-source preview after Phase E. This is a high-end operations design pass, not a new feature or claim of original Google/AI capability. Original visual references described in raw PRD §14 were not attached; use the text direction rather than pretending pixel fidelity.

## Inventory and current pain points

- `/`: access-code gate or authenticated organization/event dashboard. Clear functional forms, but dashboard lacks the persistent context rail requested in raw §8; visual hierarchy is mostly equal-weight cards.
- `/events/[eventId]`: source/master panes, intake, per-field decisions, approved export/edit and expandable history. Functionally dense; provenance and static/local status need clear hierarchy without hiding raw source text.
- `/api/access`, `/api/sign-out`, `/api/events/[eventId]/export`: nonvisual actions/download; must remain unchanged. Error boundary is a safety surface.
- There is no search/filter function in this narrow release; do not invent one just to satisfy a design template.

## Art direction

**Personality:** quiet editorial control room—precise, calm, consequential. Use restrained near-black/navy surfaces, cool slate dividers and one pale cyan action accent. Status colors are semantic, not decorative. Large titles identify context; compact uppercase labels provide scannable system hierarchy. Main content uses a generous but bounded column with dense schedule/detail cards and deliberate whitespace.

**Composition:** persistent desktop left rail for brand, organization/event context and navigation; the rail collapses into a compact top context strip on mobile. Home makes organization selection and event creation obviously sequential. Event screen prioritizes source/master panes, then intake/review and accessible change history; the approved master remains visually distinct from proposed values. Raw source text and full revision fields stay accessible in tabs/details, never removed for aesthetics.

**Design system:** consistent spacing rhythm (8/12/16/24/32), 12px metadata and 14–16px body copy, 32–42px page titles; softer elevated panels with clear borders, readable form controls, visible keyboard focus, subtle hover/pressed states, line lengths capped for prose and code text wrapped safely. Respect reduced motion and mobile one-column stacking.

## Functionality-preservation lock

Retain all routes, server actions, access checks, org/event navigation, manual source paste, proposal approve/reject, master edit/export, static source preview, provenance, revision/decision history and error states. Do not change API/schema/data behavior. Do not hide important source text or decision evidence. No new Google/AI/live labels. Test all existing workflows plus responsive/focus structure after design edits.
