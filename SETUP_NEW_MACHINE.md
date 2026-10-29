# New-machine setup

How to work on — and deploy — the Run of Show Compiler from a computer that has never touched this project. The key fact: **a deploy is just `git push`**. Vercel's git integration builds the site and pushes the Convex functions using keys stored server-side, so no service credentials need to live on your machine to ship.

Secrets never travel in this repo: `.env.local` is gitignored, and every value needed to rebuild it is pulled from Vercel in one command (step 6).

## Path A — deploy-capable machine (~5 minutes)

Enough to edit code (or let Claude Code edit it) and ship to production.

1. **Git** — preinstalled with Xcode Command Line Tools on macOS; if missing, run `xcode-select --install`.
2. **A GitHub credential** for an account with access to the private repo (it lives under `bretthoffmansage`; add any other account as a collaborator first). No `gh` CLI required — pick one:
   - **SSH**: `ssh-keygen -t ed25519 -C "new-machine"`, paste the contents of `~/.ssh/id_ed25519.pub` into github.com → Settings → *SSH and GPG keys*, then use the SSH clone URL below.
   - **HTTPS + token**: github.com → Settings → Developer settings → *Fine-grained personal access tokens* → generate one scoped to `run-of-show-compiler` with **Contents: read and write**. Use the HTTPS clone URL; when git prompts, username is the GitHub login and the password is the token (the macOS keychain remembers it after the first use).
   - **Shortcut, if `gh` is fine after all**: `brew install gh && gh auth login` wires the credential for you.
3. **Clone**:
   ```bash
   git clone git@github.com:bretthoffmansage/run-of-show-compiler.git   # SSH
   git clone https://github.com/bretthoffmansage/run-of-show-compiler.git   # or HTTPS
   ```

That's it. Any commit pushed to `main` deploys the site **and** the Convex backend automatically.

## Path B — full development machine (~15 minutes, includes Path A)

Adds the local dev server, tests, and direct Convex access.

4. **Node 20 or newer** — `node --version`; install from nodejs.org or `brew install node`.
5. **Dependencies** — `npm ci` in the repo.
6. **Recreate `.env.local`** (one-time, pulls everything from Vercel's development environment):
   ```bash
   npx vercel login
   npx vercel link --yes --project run-of-show-compiler
   npx vercel env pull .env.local
   ```
7. **Convex CLI auth** — only needed to push functions or inspect data *from this machine*; deploys via `git push` don't need it:
   ```bash
   npx convex login
   npx convex dev --once --configure=existing --team blue-melnick-fa2a1 --project runofshow-builder
   ```
   The second command re-links the repo to the Convex project (that linkage lives in `.env.local`, so it's per-machine) and pushes the current functions once.

   ⚠️ **The live site currently runs on the dev Convex deployment** (`perfect-wombat-643`), so functions pushed from any machine with `npx convex dev` reach the live backend immediately. Day to day, prefer committing and pushing to `main` instead.
8. **Verify**:
   ```bash
   npm run doctor   # environment checks with fix hints
   npm run check    # typecheck, lint, tests, build
   npm run dev      # http://localhost:3000 — sign in with an allowlisted Google account
   ```

## Claude Code on the new machine

Sign in to Claude Code with the same Anthropic account, open the cloned folder, and ask it to read `SETUP_NEW_MACHINE.md`, `README.md`, and `DEPLOYMENT.md` first — its per-machine memory doesn't transfer, but everything it needs to know about this project is in those three files. With a GitHub credential configured (step 2), it can deploy the whole stack; with steps 6–7 it can also run and test everything locally.

## What only a human can do here

- Install prerequisites (git, Node) and approve installs.
- The sign-ins: GitHub credential (step 2), `vercel login` (step 6), `convex login` (step 7), and Claude Code's own sign-in. Each is one-time per machine.
- Everything else is documented or automated; no secrets ever go in the repo.

## Reference

- Live site: https://run-of-show-compiler.vercel.app — Vercel project `run-of-show-compiler` (team `brett-sage-projects`)
- Repo: https://github.com/bretthoffmansage/run-of-show-compiler (private)
- Convex: project `runofshow-builder` (team `blue-melnick-fa2a1`); live site runs on dev deployment `perfect-wombat-643`; production `friendly-greyhound-87` is provisioned and fully configured — cutover = generate a production deploy key and swap `CONVEX_DEPLOY_KEY` + `NEXT_PUBLIC_CONVEX_URL` on Vercel.
- Rebuilding the services themselves from zero (Clerk, Google OAuth client, gateway key): `DEPLOYMENT.md`.
