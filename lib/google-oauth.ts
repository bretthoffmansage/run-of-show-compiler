/**
 * Google OAuth helpers for the dedicated studio connection. Pure functions
 * with injected configuration so token handling is unit-testable. Secrets stay
 * in server-side environment configuration; nothing here logs token values.
 */
/**
 * drive.readonly reads the client source documents; spreadsheets lets the app
 * create and write the playbook Google Sheets it generates. No broader Drive
 * write access is requested.
 */
export const GOOGLE_OAUTH_SCOPES = "openid email https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

export type OAuthFetcher = (input: string, init?: RequestInit) => Promise<Response>;

export function buildGoogleAuthUrl(args: { clientId: string; redirectUri: string; state: string }): string {
  const params = new URLSearchParams({
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    response_type: "code",
    scope: GOOGLE_OAUTH_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state: args.state,
  });
  return `${AUTH_ENDPOINT}?${params}`;
}

export function validRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    const local = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    return (url.protocol === "https:" || local) && url.pathname === "/api/google/oauth/callback" && !url.search && !url.hash;
  } catch { return false; }
}

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const segment = token.split(".")[1];
  if (!segment) return {};
  try {
    const normalized = segment.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const data: unknown = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), char => char.charCodeAt(0))));
    return data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};
  } catch { return {}; }
}

export class GoogleOAuthError extends Error {
  constructor(message: string, readonly code: "invalid_grant" | "exchange_failed" | "unavailable") {
    super(message);
    this.name = "GoogleOAuthError";
  }
}

async function tokenRequest(body: URLSearchParams, fetcher: OAuthFetcher): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetcher(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(10_000),
    });
  } catch { throw new GoogleOAuthError("Google token endpoint unreachable", "unavailable"); }
  const data: unknown = await response.json().catch(() => null);
  const record = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : null;
  if (!response.ok || !record) {
    const reason = typeof record?.error === "string" ? record.error : `status ${response.status}`;
    throw new GoogleOAuthError(`Google token request failed (${reason})`, reason === "invalid_grant" ? "invalid_grant" : "exchange_failed");
  }
  return record;
}

/** Authorization-code exchange for the one-time connect flow. */
export async function exchangeAuthorizationCode(args: {
  code: string; redirectUri: string; clientId: string; clientSecret: string; fetcher: OAuthFetcher;
}): Promise<{ refreshToken: string; accountEmail: string | null; scopes: string }> {
  const data = await tokenRequest(new URLSearchParams({
    code: args.code,
    client_id: args.clientId,
    client_secret: args.clientSecret,
    redirect_uri: args.redirectUri,
    grant_type: "authorization_code",
  }), args.fetcher);
  const refreshToken = typeof data.refresh_token === "string" ? data.refresh_token : null;
  if (!refreshToken) throw new GoogleOAuthError("Google did not return a refresh token; remove the previous grant at myaccount.google.com/permissions and connect again", "exchange_failed");
  const idToken = typeof data.id_token === "string" ? data.id_token : null;
  // The id_token arrives directly from Google's token endpoint over TLS, so
  // its payload is trusted here without a second signature verification.
  const email = idToken ? decodeJwtPayload(idToken).email : null;
  return {
    refreshToken,
    accountEmail: typeof email === "string" ? email.toLowerCase() : null,
    scopes: typeof data.scope === "string" ? data.scope : "",
  };
}

/** Mint a short-lived access token from the stored refresh token. */
export async function refreshAccessToken(args: {
  refreshToken: string; clientId: string; clientSecret: string; fetcher: OAuthFetcher;
}): Promise<string> {
  const data = await tokenRequest(new URLSearchParams({
    refresh_token: args.refreshToken,
    client_id: args.clientId,
    client_secret: args.clientSecret,
    grant_type: "refresh_token",
  }), args.fetcher);
  const accessToken = typeof data.access_token === "string" ? data.access_token : null;
  if (!accessToken) throw new GoogleOAuthError("Google returned no access token", "exchange_failed");
  return accessToken;
}

export async function revokeToken(token: string, fetcher: OAuthFetcher): Promise<void> {
  try {
    await fetcher(`${REVOKE_ENDPOINT}?token=${encodeURIComponent(token)}`, { method: "POST", signal: AbortSignal.timeout(10_000) });
  } catch { /* Revocation is best effort; the stored copy is deleted regardless. */ }
}
