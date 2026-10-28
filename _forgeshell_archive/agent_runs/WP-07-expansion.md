# WP-07 expansion log

- **Date/branch:** 2026-10-28, `forge/run-of-show-compiler`.
- **Why now/evidence:** WP-06 committed validated candidate fields (`b5ef061`); PRD-10/13/21 and R5 require chronology/matching. Audit found no compiler. Prior logs show no real model or event rules store.
- **Original breadth:** Full chronology/time-zone conversion, duplicate matching, configurable rules and re-extraction. Too broad without persisted proposals or tested provider samples.
- **Narrowing:** Reject automatic time inference and title-only merge; choose pure rules-input timeline with strict ISO/local time parsing, warnings/unplaced section, stable tie order and evidence-backed duplicate **suggestions**. This is first safe meaningful slice: it gives reviewable ordering without modifying approved state or choosing a database migration.
- **Deferred:** DST/cross-day nuance, rules persistence/UI, per-field authority, re-extraction and master writes. Remain PRD-10/13 work in WP-08+/release gate.
- **Regressions/safety:** Pure fixture data; no backend/protected systems. Preserve WP-01–06 checks. Expanded ready and hand back to executor now; separate closeout.
