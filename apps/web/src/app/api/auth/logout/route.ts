import { NextResponse } from "next/server";
import { cookieNames, destroySessionById, getSessionIdFromRequest } from "@/lib/auth";
import { expiredCookieOptions } from "@/lib/security/cookies";
import { CSRF_COOKIE_NAME } from "@/lib/security/csrf";

function isPrefetchRequest(request: Request): boolean {
  const purpose = request.headers.get("purpose") || request.headers.get("sec-purpose");
  if (purpose?.toLowerCase().includes("prefetch")) {
    return true;
  }

  if (request.headers.get("x-middleware-prefetch") === "1") {
    return true;
  }

  if (request.headers.get("next-router-prefetch") === "1") {
    return true;
  }

  return false;
}

export async function GET(request: Request) {
  if (isPrefetchRequest(request)) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    await destroySessionById(getSessionIdFromRequest(request));
  } catch (error) {
    console.error("[auth/logout] Failed to delete server session:", error);
  }

  const response = NextResponse.redirect(new URL("/", request.url));

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
