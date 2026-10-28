# run_of_show_compiler

## What this is

A local single-operator event workspace for manually capturing source notes, reviewing proposed schedule fields, and exporting an explicitly approved run of show.

This folder was prepared by **ForgeShell clean handoff** packaging. ForgeShell runtime docs were archived under `_forgeshell_archive/` and shell control directories were removed from this tree.

## How to run

1. Install dependencies: `npm ci`.
2. Follow `LOCAL_OPERATOR_SETUP.md` to start the anonymous local backend and configure operator access.

### Available commands
- `npm start` — start the app
- `npm run dev` — development server
- `npm run check:local` — local typecheck, lint, tests, build, and repo safety
- `npm test` — tests

## Setup and environment

- Copy or create env files if your app expects them (for example `.env.local`) based on project conventions.
- External npm dependencies are listed in `package.json`.
- This is a **local single-operator/manual-text preview**, not a production release. Follow `LOCAL_OPERATOR_SETUP.md` for the anonymous loopback backend, access code, and explicit deferred integrations. Do not use real client data until retention/security policy is approved.

## Deployment / launch

- Deployment targets are project-specific; infer from `package.json` and any framework config present in this repo.

## Folder name

This application directory is named `run_of_show_compiler` (filesystem-safe name from bootstrap).
