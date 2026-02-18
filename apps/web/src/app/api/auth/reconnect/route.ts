import { NextResponse } from "next/server";
import { cookieNames } from "@/lib/auth";

/**
 * Clear stale session and redirect to GitHub OAuth.
 * Used when the GitHub token has expired.
 */
export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/api/auth/github", request.url));

  // Clear the stale session cookie
  response.cookies.delete(cookieNames.session);
  response.cookies.set(cookieNames.session, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });

  return response;
}
