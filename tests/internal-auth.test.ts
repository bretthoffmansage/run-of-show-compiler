import { generateKeyPairSync, randomBytes, scryptSync } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { issueOperatorToken, verifyAccessCode, verifyOperatorToken } from "../lib/internal-auth";

const oldEnv = { ...process.env };
afterEach(() => { process.env = { ...oldEnv }; });

describe("self-managed operator access", () => {
  it("uses a salted access-code hash and rejects wrong codes", () => {
    const code = "correct-horse-battery-staple-2026";
    const salt = randomBytes(16).toString("hex");
    const stored = `${salt}:${scryptSync(code, salt, 64).toString("hex")}`;
    expect(verifyAccessCode(code, stored)).toBe(true);
    expect(verifyAccessCode("wrong-code-but-long-enough", stored)).toBe(false);
    expect(verifyAccessCode(code, undefined)).toBe(false);
  });

  it("issues and verifies audience/issuer bound JWTs without external provider", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    process.env.APP_AUTH_ISSUER = "http://localhost:3000";
    process.env.APP_AUTH_PRIVATE_KEY_B64 = Buffer.from(privateKey.export({ type: "pkcs8", format: "pem" })).toString("base64");
    process.env.APP_AUTH_PUBLIC_KEY_B64 = Buffer.from(publicKey.export({ type: "spki", format: "pem" })).toString("base64");
    const token = await issueOperatorToken();
    expect(await verifyOperatorToken(token)).toBe(true);
    expect(await verifyOperatorToken(`${token}x`)).toBe(false);
    process.env.APP_AUTH_ISSUER = "https://different.example";
    expect(await verifyOperatorToken(token)).toBe(false);
  });
});
