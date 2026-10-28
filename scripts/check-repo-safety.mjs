import { execFileSync } from "node:child_process";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
const tracked = git("ls-files", "-z").split("\0").filter(Boolean);
const forbidden = tracked.filter(path => path === ".env.local" || path === ".local-access-code" || path.startsWith(".convex/") || path.startsWith(".next/"));
if (forbidden.length) throw new Error(`Sensitive/generated local paths are tracked: ${forbidden.join(", ")}`);
if (git("diff", "--name-only", "--", "next-env.d.ts").trim()) {
  throw new Error("next-env.d.ts changed; classify intentional change versus generated drift before closeout");
}
console.log("Repo safety: local secrets/backend/build paths untracked; no next-env.d.ts drift.");
