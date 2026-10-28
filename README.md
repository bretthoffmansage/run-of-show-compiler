# Run of Show Compiler

Internal SAGE operations tool that connects an event's client-owned source documents (Google Docs and Sheets today, static paste for everything else), watches them for edits, and compiles their contents into one chronological, reviewable master run of show.

**How it works**

1. Work is organized **Organization → Event**. Each event owns its sources, snapshots, proposals, and approved master.
2. Live sources are read through one dedicated Google account (studio@poweredbysage.com) connected once in **Settings**; clients simply share their documents with that account. Its OAuth refresh token is stored sealed (AES-256-GCM) server-side in Convex and never reaches the browser.
3. A Convex cron reconciles every live source against Google every 2 minutes (cheap metadata probe; full read only when the file's revision changed). Every change is stored as an immutable snapshot with revision metadata.
4. Changed snapshots run through Claude-powered extraction (`lib/anthropic-extraction.ts` → validated by `lib/extraction.ts`). Every extracted field carries a verbatim source snippet; output that cannot be traced to the source text is rejected. Source documents are treated strictly as data — embedded instructions are never followed.
5. Extraction results become **pending proposals**. Nothing enters the approved master without operator approval; conflicting values must be decided individually. Every approval creates an immutable master revision with full audit history, exportable as HTML.

**Stack:** Next.js (App Router) on Vercel · Convex (data, crons, actions) · Clerk (Google SSO) · Anthropic API (extraction).

## Local development

```bash
npm ci
npx convex dev          # terminal 1: local Convex backend (anonymous, loopback)
npm run dev             # terminal 2: Next.js on http://localhost:3000
```

Create `.env.local` from `.env.example` (Clerk dev-instance keys + the Convex URL printed by `convex dev`). Set the Convex-side variables with `npx convex env set NAME value` — at minimum `CLERK_JWT_ISSUER_DOMAIN` and an allowlist (`ALLOWED_SIGNIN_DOMAINS` / `ALLOWED_SIGNIN_EMAILS`). Without `ANTHROPIC_API_KEY`, extraction falls back to a deterministic `YYYY-MM-DD HH:mm Title` line parser; without Google credentials, live sources show "waiting for Google connection" but manual sources work fully.

## Validation

```bash
npm run check   # repo safety, typecheck, lint, tests, build
```

Tests cover the authorization contract, snapshot immutability/dedup, the extraction validator (including prompt-injection and no-invention rejection), the sealed-token crypto, and an end-to-end mocked Google sync → extraction → proposal → approval flow.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for the one-time go-live checklist (Convex Cloud, Clerk, Google OAuth client, Anthropic key, Vercel). After that, every push to `main` deploys via Vercel; the build runs `npx convex deploy` first (see `vercel.json`).

## Security model

- Sign-in: Clerk (Google SSO). Convex additionally enforces a fail-closed server-side email/domain allowlist on **every** function call; organization/event data is membership-scoped.
- Google access: read-only Drive scope on one dedicated account, connected by an operator through OAuth. No client credentials, no password storage; disconnect revokes the token at Google and deletes the sealed copy.
- AI: the model sees only source text (as data) and reports through a schema; the validator rejects any field whose snippet is not verbatim in the source. Approval is always human.
- Secrets live in Convex/Vercel environment configuration — never in the repo, logs, or exports.

## Repo notes

`_forgeshell_archive/` preserves the original autonomous-builder planning/audit documents (including the PRD at `_forgeshell_archive/raw_prd/Run_of_Show_Compiler_PRD.md`) for traceability. Known v1 behaviors: retitling a session creates a new entry identity (old pending proposals are rejected by the operator); entries removed from a source are not yet auto-flagged; Airtable and file uploads are planned connectors — paste their contents as a static source meanwhile.
