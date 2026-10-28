import "server-only";
import { cookies } from "next/headers";
import { ConvexHttpClient } from "convex/browser";
import { verifyOperatorToken } from "./internal-auth";

export const SESSION_COOKIE = "ros_operator";

export async function sessionToken(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return await verifyOperatorToken(token) ? token! : null;
}

export async function authorizedConvex(): Promise<ConvexHttpClient | null> {
  const token = await sessionToken();
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!token || !url) return null;
  const client = new ConvexHttpClient(url);
  client.setAuth(token);
  return client;
}
