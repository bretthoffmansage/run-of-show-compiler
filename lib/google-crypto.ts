/**
 * AES-256-GCM sealing for the stored Google refresh token, via Web Crypto so
 * it runs in both Node and the Convex runtime. The key never leaves
 * server-side environment configuration and ciphertext alone is useless
 * without it.
 */

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function importKey(keyB64: string): Promise<CryptoKey> {
  const raw = fromBase64(keyB64.trim());
  if (raw.byteLength !== 32) throw new Error("Token cipher key must be 32 bytes of base64");
  return crypto.subtle.importKey("raw", raw.buffer as ArrayBuffer, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function sealSecret(plaintext: string, keyB64: string): Promise<string> {
  const key = await importKey(keyB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return `${toBase64(iv)}.${toBase64(new Uint8Array(cipher))}`;
}

export async function openSecret(sealed: string, keyB64: string): Promise<string> {
  const [ivB64, cipherB64] = sealed.split(".");
  if (!ivB64 || !cipherB64) throw new Error("Malformed sealed secret");
  const key = await importKey(keyB64);
  const iv = fromBase64(ivB64);
  const cipher = fromBase64(cipherB64);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv.buffer as ArrayBuffer }, key, cipher.buffer as ArrayBuffer);
  return new TextDecoder().decode(plain);
}
