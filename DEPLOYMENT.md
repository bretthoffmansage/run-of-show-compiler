# Go-live checklist

One-time setup, roughly 20 minutes. Afterwards every push to `main` deploys automatically.

## 1. Convex Cloud (database + sync + AI pipeline)

1. `npx convex login` (opens browser; use the SAGE account).
2. `npx convex deploy` once from this repo to create the production deployment, **or** create the project at dashboard.convex.dev and run it after step 5.
3. In the Convex dashboard → your production deployment → **Settings → Environment Variables**, set:
   | Name | Value |
   |---|---|
   | `CLERK_JWT_ISSUER_DOMAIN` | from step 2 of the Clerk section |
   | `ALLOWED_SIGNIN_DOMAINS` | `poweredbysage.com` |
   | `ALLOWED_SIGNIN_EMAILS` | any extra emails, comma-separated (e.g. `bretthoffman44@gmail.com`) |
   | `GOOGLE_CLIENT_ID` | from the Google section |
   | `GOOGLE_CLIENT_SECRET` | from the Google section |
   | `GOOGLE_TOKEN_CIPHER_KEY` | output of `openssl rand -base64 32` |
   | `GOOGLE_EXPECTED_ACCOUNT` | `studio@poweredbysage.com` |
   | `ANTHROPIC_API_KEY` | from console.anthropic.com → API keys |
   | `EXTRACTION_MODEL` | *(optional)* defaults to `claude-sonnet-5-5` |
4. **Settings → Deploy keys** → generate a production deploy key (used as `CONVEX_DEPLOY_KEY` on Vercel).

## 2. Clerk (sign-in)

1. clerk.com → create application "Run of Show Compiler". Enable **Google** as the only sign-in method (disable email/password).
2. Copy the **publishable key**, **secret key**, and the **Frontend API URL** (looks like `https://xxx.clerk.accounts.dev`) — that URL is the `CLERK_JWT_ISSUER_DOMAIN`.
3. **Configure → JWT templates → New template → Convex** (name must stay `convex`). Add to its claims: `{"email": "{{user.primary_email_address}}"}` — the server-side allowlist reads it.
4. Optional hardening: Configure → Restrictions → allowlist `poweredbysage.com` (the Convex allowlist already fails closed either way).
5. Once the Vercel domain exists: Configure → Domains → add it (moves the instance to production keys; update the two Clerk env vars on Vercel and `CLERK_JWT_ISSUER_DOMAIN` on Convex if they change).

## 3. Google Cloud (document access for studio@poweredbysage.com)

1. console.cloud.google.com → create/select a project (e.g. "SAGE Run of Show") **while signed in as studio@poweredbysage.com** (keeps ownership with the ops account).
2. **APIs & Services → Library**: enable **Google Drive API**, **Google Docs API**, **Google Sheets API**.
3. **APIs & Services → OAuth consent screen**: Internal if the account is in a Workspace org; otherwise External → publishing status *In production* is not required for a single test user — add `studio@poweredbysage.com` as a test user if staying in Testing mode. Scope: `.../auth/drive.readonly` (plus `openid`, `email`).
   - Note: in **Testing** mode Google expires refresh tokens after 7 days — publish the app (or use Internal) for a durable connection.
4. **Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorized redirect URIs: `https://<your-vercel-domain>/api/google/oauth/callback` and `http://localhost:3000/api/google/oauth/callback`
5. Copy the client ID (→ Vercel + Convex env) and client secret (→ Convex env only).

## 4. Vercel

1. vercel.com → Add New Project → import the GitHub repo. The build command comes from `vercel.json` (`npx convex deploy --cmd 'npm run build'`).
2. Environment variables (Production + Preview):
   | Name | Value |
   |---|---|
   | `CONVEX_DEPLOY_KEY` | from Convex step 4 |
   | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | from Clerk |
   | `CLERK_SECRET_KEY` | from Clerk |
   | `GOOGLE_CLIENT_ID` | from Google |
3. Deploy. (`NEXT_PUBLIC_CONVEX_URL` is injected by the Convex deploy step automatically.)

## 5. First-run smoke test

1. Open the Vercel URL → Clerk sign-in with a @poweredbysage.com Google account.
2. **Settings** → *Connect studio Google account* → complete consent **as studio@poweredbysage.com** (any other account is rejected when `GOOGLE_EXPECTED_ACCOUNT` is set).
3. Create an organization and event. Share a test Google Doc/Sheet with studio@, paste its link as a live source.
4. Within seconds the first snapshot and AI proposals appear; approve some fields, confirm the master pane and HTML export.
5. Edit the Google doc; within ~2 minutes the change should surface as new pending proposals.

## Troubleshooting

- **"Not authorized" after sign-in** → the email is not covered by `ALLOWED_SIGNIN_DOMAINS`/`ALLOWED_SIGNIN_EMAILS` on Convex, or the Clerk JWT template is missing the `email` claim / not named `convex`.
- **"Wrong Google account" when connecting** → consent was completed with a personal account; redo as studio@.
- **Google did not return a refresh token** → the grant already existed: remove the app at myaccount.google.com/permissions (as studio@) and connect again.
- **Sources stuck "Waiting for Google connection"** → no active connection in Settings.
- **Extraction says fallback parser** → `ANTHROPIC_API_KEY` missing on the **Convex** deployment (not Vercel).
