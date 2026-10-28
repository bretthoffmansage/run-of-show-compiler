import type { AuthConfig } from "convex/server";

const issuer = process.env.CLERK_JWT_ISSUER_DOMAIN;

// No configured Clerk issuer means no accepted JWTs: fail closed.
export default {
  providers: issuer ? [{ domain: issuer, applicationID: "convex" }] : [],
} satisfies AuthConfig;
