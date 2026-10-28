import { describe, expect, it } from "vitest";
import { openSecret, sealSecret } from "../lib/google-crypto";

const KEY = Buffer.alloc(32, 7).toString("base64");
const OTHER_KEY = Buffer.alloc(32, 9).toString("base64");

describe("refresh token sealing", () => {
  it("round-trips a secret and never stores it in the clear", async () => {
    const sealed = await sealSecret("1//refresh-token-value", KEY);
    expect(sealed).not.toContain("refresh-token-value");
    expect(await openSecret(sealed, KEY)).toBe("1//refresh-token-value");
  });

  it("produces distinct ciphertexts per call (fresh IV)", async () => {
    expect(await sealSecret("same", KEY)).not.toBe(await sealSecret("same", KEY));
  });

  it("rejects the wrong key, malformed input, and bad key sizes", async () => {
    const sealed = await sealSecret("secret", KEY);
    await expect(openSecret(sealed, OTHER_KEY)).rejects.toThrow();
    await expect(openSecret("not-sealed", KEY)).rejects.toThrow("Malformed sealed secret");
    await expect(sealSecret("x", Buffer.alloc(8, 1).toString("base64"))).rejects.toThrow("32 bytes");
  });
});
