# Local operator preview — setup and limits

This is the operator-approved **local, single-operator, manual-text** release. It is not a hosted production launch, does not connect Google or AI, and does not auto-sync. Use synthetic or otherwise authorized data only until a retention/security policy is agreed.

## Start locally

1. Install dependencies: `npm ci`.
2. Start an **anonymous local** Convex backend in one terminal: `npx convex dev`. Confirm `.env.local` contains an `anonymous:` `CONVEX_DEPLOYMENT` and loopback `NEXT_PUBLIC_CONVEX_URL`. Do not select a production deployment.
3. In a second terminal, run `npm run setup:local-access` **once**. It writes an ignored, mode-0600 `.local-access-code` and signing material to ignored `.env.local`; it refuses to overwrite them. Do not commit, paste, or share either file. If already configured, skip this step.
4. With local Convex running, run `npm run configure:local-convex-auth`. The script refuses a non-anonymous or non-loopback target and sends **only** the public issuer/JWKS to local Convex. The `convex dev` watcher must finish pushing functions.
5. Run `npm run dev` (bound to loopback), visit `http://localhost:3000`, and enter the access code from `.local-access-code` (read it locally, not in chat). Create an organization and event, paste a static source, then review each proposed field before exporting the approved HTML.

The access code represents **one shared operator identity**. It is not SAGE SSO, member onboarding, or production-grade access management. Signing out clears the browser cookie; rotate the signing key/access code to invalidate existing sessions. Keep the local machine and files private.

## Validation and data boundaries

- `npm run typecheck && npm run lint && npm test && npm run build`
- `npm audit --audit-level=high`
- Manual text is stored in the local Convex backend and displayed as **static**, never as synced. Approved fields retain source snapshot provenance. Proposals do not change the master without an explicit approval.
- HTML export is a provisional, approved-revision-only download. It is not the agreed production output format.
- Local backend data is **not** part of the git tree or ForgeShell handoff archive. Back up or delete it separately according to an approved policy before handling real client data.

## Deferred before production or original PRD acceptance

Approved SAGE multi-user identity/roles; Google OAuth/account access and live Docs/Sheets sync; provider notifications/polling/reconciliation; AI extraction and representative accuracy tests; uploads; production Convex/Vercel/GitHub setup; retention/deletion and secret handling review; official export target/write-back decision; full browser/accessibility and performance verification. See `RELEASE_READINESS_AUDIT.md` and `FORGESHELL_FINAL_CLOSEOUT.md` for the final disposition.
