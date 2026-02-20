import { NextResponse } from "next/server";
import { cookieNames } from "@/lib/auth";
import { expiredCookieOptions } from "@/lib/security/cookies";
import { CSRF_COOKIE_NAME } from "@/lib/security/csrf";

export async function GET(request: Request) {
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
