# Hardening pass 3 — untrusted ID boundary

Added a narrow route/form identifier shape guard before Convex calls and redirects, replacing direct opaque-ID casts at the HTTP boundary. Convex remains the authoritative validator and tenant authorization layer. Malformed route IDs now return 404 in event/export routes; malformed form IDs are rejected before mutation. Focused test rejects path/control payloads. `npm run check:local` passed (13 files/33 tests, build). No schema change or production backend touched. Commit separately and verify clean tree.
