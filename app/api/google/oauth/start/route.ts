import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { buildGoogleAuthUrl } from "../../../../../lib/google-oauth";

/** Begins the one-time studio-account connect flow (signed-in operators only). */
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return new Response("Google OAuth is not configured: set GOOGLE_CLIENT_ID", { status: 503 });
  const url = new URL(request.url);
  const state = crypto.randomUUID();
  (await cookies()).set("google_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    path: "/api/google/oauth",
    maxAge: 600,
  });
  redirect(buildGoogleAuthUrl({ clientId, redirectUri: `${url.origin}/api/google/oauth/callback`, state }));
}
