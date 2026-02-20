import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/response";
import { cookieNames, destroySessionById, getSessionIdFromRequest } from "@/lib/auth";
import { normalizeReturnTo } from "@/lib/auth-return-to";
import { getCanonicalBaseUrl } from "@/lib/app-url";
import { expiredCookieOptions, oauthStateCookieOptions } from "@/lib/security/cookies";
import { CSRF_COOKIE_NAME } from "@/lib/security/csrf";
import { applyMutationGuards } from "@/lib/security/mutation-guard";

/**
 * Clear stale session and redirect directly to GitHub OAuth.
 * Used when the GitHub token has expired or needs refresh.
 */
export async function POST(request: NextRequest) {
  const clientId = process.env.GITHUB_CLIENT_ID;

  if (!clientId) {
    return apiError("Missing GITHUB_CLIENT_ID", { status: 500 });
  }

  const guard = applyMutationGuards({
    request,
    bucket: "auth-reconnect",
    identity: getSessionIdFromRequest(request) || "anonymous",
    limit: 20,
    windowMs: 60_000,
  });
  if (guard) {
    return guard;
  }

  const body = await request.json().catch(() => ({}));
  const bodyReturnTo =
    typeof (body as { returnTo?: unknown }).returnTo === "string"
      ? (body as { returnTo: string }).returnTo
      : null;

  const state = randomBytes(16).toString("hex");
  const redirectUri = `${getCanonicalBaseUrl(request)}/api/auth/github`;
  const requestedReturnTo = normalizeReturnTo(
    bodyReturnTo ?? new URL(request.url).searchParams.get("returnTo"),
  );

  // Go directly to GitHub, bypassing our auth endpoint
  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("scope", "repo read:user user:email");

  const response = apiSuccess({ redirectTo: authorizeUrl.toString() });
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
