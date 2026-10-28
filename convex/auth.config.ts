import type { AuthConfig } from "convex/server";

const issuer = process.env.APP_AUTH_ISSUER;
const jwks = process.env.APP_AUTH_JWKS_URI;

// No configured issuer/key means no accepted JWTs: fail closed.
export default {
  providers: issuer && jwks ? [{ type: "customJwt", applicationID: "run-of-show-compiler", issuer, jwks, algorithm: "RS256" }] : [],
} satisfies AuthConfig;
