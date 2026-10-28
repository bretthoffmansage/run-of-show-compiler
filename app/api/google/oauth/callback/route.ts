import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api } from "../../../../../convex/_generated/api";
import { authorizedConvex } from "../../../../../lib/server-session";

/**
 * Google redirects here after consent. The authorization code is forwarded to
 * Convex, where the client secret lives and the token exchange happens; no
 * token material touches this route or the browser.
 */
export async function GET(request: Request) {
  const client = await authorizedConvex();
  if (!client) redirect("/sign-in");
  const url = new URL(request.url);
  const jar = await cookies();
  const expectedState = jar.get("google_oauth_state")?.value;
  jar.delete("google_oauth_state");
  const providerError = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  let notice: string;
  if (providerError) {
    notice = `Google reported: ${providerError}`;
  } else if (!code || !state || !expectedState || state !== expectedState) {
    notice = "Connection attempt could not be verified (state mismatch); try again";
  } else {
    try {
      const result = await client.action(api.google.completeOAuth, { code, redirectUri: `${url.origin}/api/google/oauth/callback` });
      notice = `connected:${result.accountEmail}`;
    } catch (error) {
      notice = error instanceof Error ? cleanConvexError(error.message) : "Connection failed";
    }
  }
  redirect(`/settings?google=${encodeURIComponent(notice.slice(0, 300))}`);
}

function cleanConvexError(message: string): string {
  // Convex prefixes thrown errors with call metadata; keep the human part.
  const index = message.indexOf("Uncaught Error: ");
  return index >= 0 ? message.slice(index + "Uncaught Error: ".length).split("\n")[0] : message.split("\n")[0];
}
