import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { cookieNames, destroySessionById, getSessionIdFromRequest } from "@/lib/auth";
import { normalizeReturnTo } from "@/lib/auth-return-to";
import { getCanonicalBaseUrl } from "@/lib/app-url";
import { expiredCookieOptions, oauthStateCookieOptions } from "@/lib/security/cookies";
import { CSRF_COOKIE_NAME } from "@/lib/security/csrf";

/**
 * Clear stale session and redirect directly to GitHub OAuth.
 * Used when the GitHub token has expired or needs refresh.
 */
export async function GET(request: Request) {
  const clientId = process.env.GITHUB_CLIENT_ID;

  if (!clientId) {
    return apiError("Missing GITHUB_CLIENT_ID", { status: 500 });
  }

  const state = randomBytes(16).toString("hex");
  const redirectUri = `${getCanonicalBaseUrl(request)}/api/auth/github`;
  const requestedReturnTo = normalizeReturnTo(new URL(request.url).searchParams.get("returnTo"));

  // Go directly to GitHub, bypassing our auth endpoint
  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("scope", "repo read:user user:email");

  const response = NextResponse.redirect(authorizeUrl);
  try {
    await destroySessionById(getSessionIdFromRequest(request));
  } catch (error) {
    console.error("[auth/reconnect] Failed to delete server session:", error);
  }

  // Clear old session
  response.cookies.delete(cookieNames.session);
  response.cookies.set(cookieNames.session, "", expiredCookieOptions());
  response.cookies.set(CSRF_COOKIE_NAME, "", expiredCookieOptions("strict"));

  // Set OAuth state + return destination for callback validation
  response.cookies.set(cookieNames.oauthState, state, oauthStateCookieOptions());
  response.cookies.set(cookieNames.oauthReturnTo, requestedReturnTo, oauthStateCookieOptions());

  return response;
}
