import { NextRequest, NextResponse } from "next/server";
import { issueOperatorToken, verifyAccessCode } from "../../../lib/internal-auth";
import { SESSION_COOKIE } from "../../../lib/server-session";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new NextResponse("Invalid origin", { status: 403 });
  const form = await request.formData();
  const code = form.get("code");
  if (typeof code !== "string" || !verifyAccessCode(code, process.env.APP_ACCESS_CODE_HASH)) {
    return NextResponse.redirect(new URL("/?access=denied", request.url), 303);
  }
  try {
    const token = await issueOperatorToken();
    const response = NextResponse.redirect(new URL("/", request.url), 303);
    response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 8 * 60 * 60 });
    return response;
  } catch {
    return new NextResponse("Internal access is not configured", { status: 503 });
  }
}
