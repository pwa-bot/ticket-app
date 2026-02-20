import { NextRequest } from "next/server";
import { apiSuccess } from "@/lib/api/response";
import { cookieNames, destroySessionById, getSessionIdFromRequest } from "@/lib/auth";
import { expiredCookieOptions } from "@/lib/security/cookies";
import { CSRF_COOKIE_NAME } from "@/lib/security/csrf";
import { applyMutationGuards } from "@/lib/security/mutation-guard";

export async function POST(request: NextRequest) {
  const guard = applyMutationGuards({
    request,
    bucket: "auth-logout",
    identity: getSessionIdFromRequest(request) || "anonymous",
    limit: 20,
    windowMs: 60_000,
  });
  if (guard) {
    return guard;
  }

  try {
    await destroySessionById(getSessionIdFromRequest(request));
  } catch (error) {
    console.error("[auth/logout] Failed to delete server session:", error);
  }

  const response = apiSuccess({ redirectTo: "/" });

  // Delete cookies by setting empty value with expires in the past
  response.cookies.set(cookieNames.session, "", expiredCookieOptions());

  response.cookies.set(cookieNames.selectedRepo, "", expiredCookieOptions());
  response.cookies.set(CSRF_COOKIE_NAME, "", expiredCookieOptions("strict"));

  // Also try the delete method
  response.cookies.delete(cookieNames.session);
  response.cookies.delete(cookieNames.selectedRepo);
  response.cookies.delete(CSRF_COOKIE_NAME);

  return response;
}
