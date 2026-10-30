# Run of Show Compiler

Internal SAGE operations tool that connects an event's client-owned source documents (Google Docs and Sheets today, static paste for everything else), watches them for edits, and compiles their contents into one chronological, reviewable master run of show.

**How it works**

1. Work is organized **Organization → Event**. Each event owns its sources, snapshots, and compiled master.
2. Live sources are read through one dedicated Google account (studio@poweredbysage.com) connected once in **Settings**; clients simply share their documents with that account. Its OAuth refresh token is stored sealed (AES-256-GCM) server-side in Convex and never reaches the browser.
3. A Convex cron reconciles every live source against Google every 2 minutes (cheap metadata probe; full read only when the file's revision changed). Every change is stored as an immutable snapshot with revision metadata.
4. Changed snapshots run through Claude-powered extraction — via the Vercel AI Gateway's OpenAI-compatible route when `AI_GATEWAY_API_KEY` is set (`lib/gateway-extraction.ts`; streaming, provider-prefixed model slugs like `anthropic/claude-sonnet-5.5`), else the direct Anthropic API (`lib/anthropic-extraction.ts`) — always validated by `lib/extraction.ts`. Every extracted field carries a verbatim source snippet; output that cannot be traced to the source text is rejected. Source documents are treated strictly as data — embedded instructions are never followed.
5. Extraction results **compile straight into the master — zero approval clicks**. When sources disagree about a field, the compile proceeds anyway: the most recently captured source wins the cell and the field is marked **red** (sources disagree — ask the client). Values changed by a recent source edit are marked **pink** for 24 hours. Marks are text-color visual cues for the humans running the event, not an approval queue. Every compile creates an immutable master revision with full audit history, exportable as HTML; operators can still correct values manually (an edit, not an approval).

**Stack:** Next.js (App Router) on Vercel · Convex (data, crons, actions) · Clerk (Google SSO) · Claude via Vercel AI Gateway (extraction).

## Local development

```bash
npm ci
npx convex dev          # terminal 1: local Convex backend (anonymous, loopback)
npm run dev             # terminal 2: Next.js on http://localhost:3000
```

Create `.env.local` from `.env.example` (Clerk dev-instance keys + the Convex URL printed by `convex dev`). Set the Convex-side variables with `npx convex env set NAME value` — at minimum `CLERK_JWT_ISSUER_DOMAIN` and an allowlist (`ALLOWED_SIGNIN_DOMAINS` / `ALLOWED_SIGNIN_EMAILS`). Without `AI_GATEWAY_API_KEY` (or `ANTHROPIC_API_KEY`), extraction falls back to a deterministic `YYYY-MM-DD HH:mm Title` line parser; without Google credentials, live sources show "waiting for Google connection" but manual sources work fully.

**Current deployment posture:** the live Vercel site intentionally runs against the Convex **dev** deployment (`perfect-wombat-643`) while the product is tuned; the provisioned production deployment (`friendly-greyhound-87`) is fully configured and idle. To cut over, generate a production deploy key and swap Vercel's `CONVEX_DEPLOY_KEY` and `NEXT_PUBLIC_CONVEX_URL`.

## Validation

```bash
npm run check   # repo safety, typecheck, lint, tests, build
```

Tests cover the authorization contract, snapshot immutability/dedup, the extraction validator (including prompt-injection and no-invention rejection), the sealed-token crypto, and an end-to-end mocked Google sync → extraction → zero-click compile flow (including conflict and change marking).

## Deployment

Setting up a **new computer** to work on or deploy this project: [SETUP_NEW_MACHINE.md](SETUP_NEW_MACHINE.md) (a deploy needs nothing but git + a GitHub credential; `npm run doctor` verifies a machine).

See [DEPLOYMENT.md](DEPLOYMENT.md) for the one-time go-live checklist (Convex Cloud, Clerk, Google OAuth client, Anthropic key, Vercel). After that, every push to `main` deploys via Vercel; the build runs `npx convex deploy` first (see `vercel.json`).

## Security model

- Sign-in: Clerk (Google SSO). Convex additionally enforces a fail-closed server-side email/domain allowlist on **every** function call; organization/event data is membership-scoped.
- Google access: one dedicated account connected by an operator through OAuth, with read-only Drive scope (client sources) plus the Sheets scope (creating and writing the playbook spreadsheets the app generates — no broader Drive write access). No client credentials, no password storage; disconnect revokes the token at Google and deletes the sealed copy.
- AI: the model sees only source text (as data) and reports through a schema; the validator rejects any field whose snippet is not verbatim in the source — invalid output is skipped, never compiled. Compilation is automatic; every compiled value stays traceable to its source snapshot, and the immutable revision history records every change.
- Secrets live in Convex/Vercel environment configuration — never in the repo, logs, or exports.

## Repo notes

`_forgeshell_archive/` preserves the original autonomous-builder planning/audit documents (including the PRD at `_forgeshell_archive/raw_prd/Run_of_Show_Compiler_PRD.md`) for traceability. Known behaviors: entry identity is the date + start-time slot (a retitled session stays the same entry and shows as a pink change; two sources disagreeing about a slot show as a red conflict); entries removed from a source are not yet auto-flagged; Airtable tables are live sources (one personal access token in Settings; re-read every 2 minutes, one tab per Day field value, every record read cell by cell). File uploads are a planned connector — paste their contents as a static source meanwhile. The product direction (Google Sheet playbook output, split-screen source/playbook UI) is specced in `PLAYBOOK_SPEC.md`.
