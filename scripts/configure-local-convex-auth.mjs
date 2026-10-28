import { readFileSync } from "node:fs";

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8")
  .split("\n").map(line => line.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(match => [match[1], match[2]]));
const target = env.NEXT_PUBLIC_CONVEX_URL;
if (!env.CONVEX_DEPLOYMENT?.startsWith("anonymous:") || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(target ?? "")) {
  throw new Error("Refusing to configure auth: expected an anonymous loopback Convex deployment");
}
const local = JSON.parse(readFileSync(new URL("../.convex/local/default/config.json", import.meta.url), "utf8"));
if (local.deploymentName !== env.CONVEX_DEPLOYMENT.split(":")[1] || String(local.ports?.cloud) !== new URL(target).port || !local.adminKey) {
  throw new Error("Refusing to configure auth: local deployment configuration does not match .env.local");
}
for (const name of ["APP_AUTH_ISSUER", "APP_AUTH_JWKS_URI"]) {
  if (!env[name]) throw new Error(`Missing ${name}; run setup-local-access first`);
}
// Local Convex's admin endpoint is used only for the verified loopback deployment.
// The signing private key and access-code hash are never sent.
const response = await fetch(new URL("/api/update_environment_variables", target), {
  method: "POST",
  headers: { Authorization: `Convex ${local.adminKey}`, "Content-Type": "application/json" },
  body: JSON.stringify({ changes: [
    { name: "APP_AUTH_ISSUER", value: env.APP_AUTH_ISSUER },
    { name: "APP_AUTH_JWKS_URI", value: env.APP_AUTH_JWKS_URI },
  ] }),
});
if (!response.ok) throw new Error(`Local Convex environment update failed (${response.status}); ensure convex dev is running`);
console.log("Public JWT issuer/JWKS configured on the anonymous local Convex deployment. No private key was sent.");
