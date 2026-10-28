/**
 * Server-side sign-in allowlist. Clerk (or any upstream IdP) authenticates;
 * this decides which verified identities the application accepts. Fail closed:
 * with no allowlist configured, nobody is allowed in.
 */
export function emailAllowed(email: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  const emails = (env.ALLOWED_SIGNIN_EMAILS ?? "").split(",").map(item => item.trim().toLowerCase()).filter(Boolean);
  const domains = (env.ALLOWED_SIGNIN_DOMAINS ?? "").split(",").map(item => item.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
  if (!emails.length && !domains.length) return false;
  const value = email?.trim().toLowerCase();
  if (!value || !value.includes("@")) return false;
  return emails.includes(value) || domains.some(domain => value.endsWith(`@${domain}`));
}
