# WP-06 expansion log

- **Date/branch:** 2026-10-28, `forge/run-of-show-compiler`.
- **Why now/evidence:** WP-04 snapshot/revision and WP-05 read adapter committed; PRD-09/19/21 and R5 call for normalized, cited candidates. Audit had no extraction. Prior logs explicitly show no real AI provider, so fixture contract is appropriate first slice. [Zod schema validation](https://zod.dev/basics) supports runtime rejection of malformed model output.
- **Original breadth:** Full AI service, persistent extraction jobs and representative client-file interpretation. Too broad without provider, samples or retention choice.
- **Narrowing:** Rejected real model calls and unconstrained prompts; selected one bounded excerpt, schema-validated output and per-field provenance. This is first meaningful safe level because normalization and no-invention checks can run locally without secrets or customer data. Further narrowing to types alone would not prove behavior.
- **Deferred:** Provider credentials/live accuracy, full document segmentation, persistence/jobs, merge/approval. These remain R5/R8/WP-07–10 commitments, not complete by this package.
- **Safety/regression:** Source text is data only, adapter receives no tools/secrets. All prior checks must pass. Expanded ready; return to executor now and commit separately after validation.
