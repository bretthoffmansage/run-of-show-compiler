import { scryptSync, timingSafeEqual } from "node:crypto";
import { importPKCS8, importSPKI, jwtVerify, SignJWT } from "jose";

const AUDIENCE = "run-of-show-compiler";
const SUBJECT = "internal-operator";

export function verifyAccessCode(code: string, storedHash: string | undefined): boolean {
  if (!storedHash || code.length < 16 || code.length > 256) return false;
  const [salt, hex] = storedHash.split(":");
  if (!/^[0-9a-f]{32}$/.test(salt ?? "") || !/^[0-9a-f]{128}$/.test(hex ?? "")) return false;
  const expected = Buffer.from(hex, "hex");
  const actual = scryptSync(code, salt, expected.length);
  return timingSafeEqual(expected, actual);
}

function config() {
  const issuer = process.env.APP_AUTH_ISSUER;
  const privateKey = process.env.APP_AUTH_PRIVATE_KEY_B64;
  const publicKey = process.env.APP_AUTH_PUBLIC_KEY_B64;
  if (!issuer || !privateKey || !publicKey) throw new Error("Internal access is not configured");
  return { issuer, privateKey: Buffer.from(privateKey, "base64").toString("utf8"), publicKey: Buffer.from(publicKey, "base64").toString("utf8") };
}

export async function issueOperatorToken(): Promise<string> {
  const { issuer, privateKey } = config();
  const key = await importPKCS8(privateKey, "RS256");
  return new SignJWT({ role: "operator" })
    .setProtectedHeader({ alg: "RS256", kid: "operator-v1", typ: "JWT" })
    .setSubject(SUBJECT).setIssuer(issuer).setAudience(AUDIENCE)
    .setIssuedAt().setExpirationTime("8h").sign(key);
}

export async function verifyOperatorToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const { issuer, publicKey } = config();
    const key = await importSPKI(publicKey, "RS256");
    const { payload } = await jwtVerify(token, key, { issuer, audience: AUDIENCE, algorithms: ["RS256"] });
    return payload.sub === SUBJECT;
  } catch { return false; }
}
