import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

/** New-machine environment check. Each failure prints its fix; see SETUP_NEW_MACHINE.md. */
let failures = 0;

function check(label, run, fix) {
  try {
    const detail = run();
    console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  } catch (error) {
    failures++;
    console.log(`FAIL  ${label} — ${error.message}`);
    if (fix) console.log(`      fix: ${fix}`);
  }
}

check("Node 20+", () => {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 20) throw new Error(`found ${process.versions.node}`);
  return `v${process.versions.node}`;
}, "install Node 20+ (nodejs.org or `brew install node`)");

check("git installed", () =>
  execFileSync("git", ["--version"], { encoding: "utf8" }).trim(),
"`xcode-select --install` on macOS");

check("GitHub remote reachable with a working credential", () => {
  execFileSync("git", ["ls-remote", "--exit-code", "--heads", "origin", "main"], { stdio: ["ignore", "pipe", "pipe"] });
  return "origin/main visible — `git push` deploys will work";
}, "set up an SSH key or HTTPS token for github.com (SETUP_NEW_MACHINE.md, step 2)");

check("dependencies installed", () => {
  if (!existsSync(new URL("../node_modules", import.meta.url))) throw new Error("node_modules missing");
  return "node_modules present";
}, "npm ci");

check(".env.local has the app configuration", () => {
  const path = new URL("../.env.local", import.meta.url);
  if (!existsSync(path)) throw new Error(".env.local missing");
  const text = readFileSync(path, "utf8");
  const required = ["NEXT_PUBLIC_CONVEX_URL", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"];
  const missing = required.filter(name => !new RegExp(`^${name}=.+`, "m").test(text));
  if (missing.length) throw new Error(`missing ${missing.join(", ")}`);
  return "required variables present";
}, "npx vercel login && npx vercel link --yes --project run-of-show-compiler && npx vercel env pull .env.local");

check("Convex CLI authenticated (optional; git-push deploys work without it)", () => {
  if (process.env.CONVEX_DEPLOY_KEY) return "deploy key in environment";
  const home = process.env.HOME || process.env.USERPROFILE;
  if (home && existsSync(`${home}/.convex/config.json`)) return "logged in";
  throw new Error("not logged in");
}, "npx convex login (only needed to push functions or inspect data from this machine)");

console.log(failures ? `\n${failures} check(s) failed — fixes above.` : "\nAll checks passed. `git push` to main deploys site + backend.");
process.exit(failures ? 1 : 0);
