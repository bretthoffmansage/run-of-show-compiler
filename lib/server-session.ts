import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";

/**
 * Convex client authorized as the signed-in Clerk user, or null when signed
 * out / not configured. Authorization decisions live in Convex functions;
 * this only forwards the verified identity token.
 */
export async function authorizedConvex(): Promise<ConvexHttpClient | null> {
  const { userId, getToken } = await auth();
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!userId || !url) return null;
  const token = await getToken({ template: "convex" });
  if (!token) return null;
  const client = new ConvexHttpClient(url);
  client.setAuth(token);
  return client;
}

export async function signedInEmail(): Promise<string | null> {
  const user = await currentUser();
  return user?.primaryEmailAddress?.emailAddress ?? null;
}
