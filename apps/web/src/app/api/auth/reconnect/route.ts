import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { cookieNames } from "@/lib/auth";
import { expiredCookieOptions, oauthStateCookieOptions } from "@/lib/security/cookies";
import { CSRF_COOKIE_NAME } from "@/lib/security/csrf";

function getBaseUrl(request: Request): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

/**
 * Clear stale session and redirect directly to GitHub OAuth.
 * Used when the GitHub token has expired or needs refresh.
 */
export async function GET(request: Request) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  
  if (!clientId) {
    return NextResponse.json({ error: "Missing GITHUB_CLIENT_ID" }, { status: 500 });
  }

  const state = randomBytes(16).toString("hex");
  const redirectUri = `${getBaseUrl(request)}/api/auth/github`;
  
  // Go directly to GitHub, bypassing our auth endpoint
  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("scope", "repo read:user user:email");

  const response = NextResponse.redirect(authorizeUrl);

  // Clear old session
  response.cookies.delete(cookieNames.session);
  response.cookies.set(cookieNames.session, "", expiredCookieOptions());
  response.cookies.set(CSRF_COOKIE_NAME, "", expiredCookieOptions("strict"));
  
  // Set OAuth state for validation
  response.cookies.set(cookieNames.oauthState, state, oauthStateCookieOptions());

  return response;
}
