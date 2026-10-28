import { generateKeyPairSync, randomBytes, scryptSync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";

const envPath = new URL("../.env.local", import.meta.url);
const codePath = new URL("../.local-access-code", import.meta.url);
const current = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
if (current.includes("APP_AUTH_PRIVATE_KEY_B64=") || existsSync(codePath)) {
  throw new Error("Local access is already configured; refusing to overwrite it");
}
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privatePem = privateKey.export({ type: "pkcs8", format: "pem" });
const publicPem = publicKey.export({ type: "spki", format: "pem" });
const jwk = publicKey.export({ format: "jwk" });
const jwks = { keys: [{ ...jwk, kid: "operator-v1", alg: "RS256", use: "sig" }] };
const code = randomBytes(24).toString("base64url");
const salt = randomBytes(16).toString("hex");
const hash = scryptSync(code, salt, 64).toString("hex");
const additions = [
  `APP_AUTH_ISSUER=http://localhost:3000`,
  `APP_AUTH_PRIVATE_KEY_B64=${Buffer.from(privatePem).toString("base64")}`,
  `APP_AUTH_PUBLIC_KEY_B64=${Buffer.from(publicPem).toString("base64")}`,
  `APP_AUTH_JWKS_URI=data:text/plain;charset=utf-8;base64,${Buffer.from(JSON.stringify(jwks)).toString("base64")}`,
  `APP_ACCESS_CODE_HASH=${salt}:${hash}`,
].join("\n");
writeFileSync(envPath, `${current.trimEnd()}\n${additions}\n`, { mode: 0o600 });
chmodSync(envPath, 0o600);
writeFileSync(codePath, `${code}\n`, { mode: 0o600 });
console.log("Local operator access configured. Access code saved to .local-access-code (mode 0600); no secret printed.");
console.log("Set APP_AUTH_ISSUER and APP_AUTH_JWKS_URI in the selected Convex development environment before pushing auth.config.ts.");
