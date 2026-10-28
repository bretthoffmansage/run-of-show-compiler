# ForgeShell archive

This folder contains files **archived by ForgeShell packaging** (clean for handoff).

- The workspace was cleaned for **application handoff**.
- ForgeShell runtime logs and final shell planning/audit artifacts were **moved here**, not destroyed.
- Shell control directories (`shell/`, `.codex/`, `.claude/`, `bootstrap/`, `dry_runs/`) were removed from the application tree per packaging rules.
- The ForgeShell-only `scripts/` tree (or `scripts-forgeshell-only/` when your app also had files under `scripts/`) is archived here rather than left in the handed-off app.

Keep this folder if you need traceability of the original shell run.
