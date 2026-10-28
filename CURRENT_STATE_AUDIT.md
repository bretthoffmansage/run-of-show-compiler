# CURRENT_STATE_AUDIT — Run of Show Compiler

- **Date:** 2026-10-28
- **Method:** Repository inspection; no application runtime or provider account was available.
- **Scope:** This `shell-core` root, raw PRD, shell control/templates, Git state, and application/config discovery.

## Executive finding

This is a **fresh ForgeShell project workspace, not an existing Run of Show Compiler application**. The root contains reusable shell documents, bootstrap/packaging scripts, a single raw PRD, and generated `PRD_SOURCE.md`. There is no `package.json`, Next.js app, route, backend, schema, authentication, test suite, or deployment configuration. A local Git repository was newly initialized and an isolated `forge/run-of-show-compiler` branch created; the shell baseline was committed. No remote was added. Application runtime, provider credentials, deployment and production data were not inspected and must not be inferred.

## Start here

| Path | Role |
|---|---|
| `raw_prd/Run_of_Show_Compiler_PRD.md` | Original product requirements, §§1–14. |
| `PRD_SOURCE.md` | Stable normalized anchors PRD-01–23 and ambiguities. |
| `shell/reusable/REUSABLE_SHELL_WORKFLOW.md` | Phase and closeout rules. |
| `shell/control/AGENT_OPERATING_RULES.md` | Safety/scope rules. |
| `shell/templates/` | Planning and closeout templates, not app code. |

## Actual structure and surfaces

| Area | Observed state | Classification |
|---|---|---|
| `shell/`, `bootstrap/`, `.codex/`, `.claude/` | ForgeShell control/runtime instructions | Implemented shell infrastructure, **not product** |
| `raw_prd/` | One Markdown PRD; mentioned visual/sample files not present | Product input only |
| `scripts/forgeshell-packaging-handoff.mjs`, `.forgeshell/packaging.json` | Optional final workspace packaging | Shell-only |
| `agent_runs/` | Placeholder `.gitkeep`; no execution logs | Empty |
| Next.js app, API, UI, tests | No files observed | Missing |
| Convex or other persistent backend | No schema/functions/config observed | Missing |
| Auth, organization/event access | No product code observed | Missing |
| Google/AI/Airtable integrations | No product code or verified credentials observed | Missing |
| Vercel/GitHub | No local deployment config or remote observed | Unverified / missing locally |

## Routing, data, authorization and runtime

No product routes, navigation, app entry point, server actions, data flow, database, membership guard, OAuth flow, ingestion worker, or export code exists. Therefore none of PRD-01–21 has implementation evidence. Do not mistake shell files or the PRD for delivered features. No legacy app behavior needs preservation. Git and shell tooling are the only established regression baseline.

## Gaps by requirement anchor

- **Foundation/security:** PRD-01–03, 17, 19: app scaffold, identity, tenant model, persistence decision, server-side authorization and safe configuration all absent.
- **Sources and sync:** PRD-04–08, 16, 18, 20: provider connections, upload, snapshots, monitoring, status and histories absent.
- **Compilation/review:** PRD-09–13, 21: extraction, time handling, matching, conflict review, rules, approval/export and representative tests absent.
- **Experience:** PRD-14–15: no product workspace/UI exists. Image references are not present; text direction only is available.
- **Deferred:** PRD-22 is explicitly post-MVP, not a current implementation gap. PRD-23 defines features that must not be introduced.

## Risks and sequencing implications

1. **Do not fake a live connector.** Google account model, scopes, notifications and actual access are unresolved (AMB-02). Build contracts, fixtures and truthful disconnected states first.
2. **No backend chosen.** Convex is optional; persistence/jobs/OAuth token fit must be validated before sole-backend adoption (AMB-03). Avoid production data mutation.
3. **Identity unresolved.** A scaffold may be possible, but production tenant authorization cannot be claimed until a SAGE provider and membership model are configured (AMB-01).
4. **AI and upload attack surface.** Treat client documents as untrusted; extract only through validated server-side contracts, no source instructions/tools/secrets (PRD-09, 19).
5. **No design assets locally.** Design pass should use the PRD's described composition without claiming pixel fidelity (AMB-07).
6. **No runtime baseline yet.** First executable package should establish the minimal app and automated checks. Later units must protect those checks and close out separately.

## Readiness conclusion

Ready for a dependency-aware roadmap and draft-first packages. Not ready for claims of live synchronization, deployed service, or accepted production MVP. External integrations default to scaffold/configure-later, with explicit gates rather than an up-front stop.
