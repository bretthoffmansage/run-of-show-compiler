import { describe, expect, it } from "vitest";
import { emailAllowed } from "../lib/signin-allowlist";

describe("sign-in allowlist", () => {
  it("fails closed when nothing is configured", () => {
    expect(emailAllowed("anyone@poweredbysage.com", {})).toBe(false);
    expect(emailAllowed("anyone@poweredbysage.com", { ALLOWED_SIGNIN_DOMAINS: "", ALLOWED_SIGNIN_EMAILS: " " })).toBe(false);
  });

  it("matches configured domains case-insensitively", () => {
    const env = { ALLOWED_SIGNIN_DOMAINS: "poweredbysage.com, Example.ORG" };
    expect(emailAllowed("Studio@PoweredBySage.com", env)).toBe(true);
    expect(emailAllowed("a@example.org", env)).toBe(true);
    expect(emailAllowed("a@not-poweredbysage.com", env)).toBe(false);
    expect(emailAllowed("a@poweredbysage.com.evil.com", env)).toBe(false);
  });

  it("matches explicit emails and rejects malformed input", () => {
    const env = { ALLOWED_SIGNIN_EMAILS: "brett@gmail.com" };
    expect(emailAllowed("brett@gmail.com", env)).toBe(true);
    expect(emailAllowed("other@gmail.com", env)).toBe(false);
    expect(emailAllowed(null, env)).toBe(false);
    expect(emailAllowed("not-an-email", env)).toBe(false);
  });

  it("accepts a leading @ in domain configuration", () => {
    expect(emailAllowed("a@sage.com", { ALLOWED_SIGNIN_DOMAINS: "@sage.com" })).toBe(true);
  });
});
