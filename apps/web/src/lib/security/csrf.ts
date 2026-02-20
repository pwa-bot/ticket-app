import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { getCanonicalBaseUrl } from "@/lib/app-url";
import { createOpaqueToken, shouldUseSecureCookies } from "@/lib/security/cookies";

export const CSRF_COOKIE_NAME = "ticket_app_csrf";
const CSRF_HEADER_NAME = "x-csrf-token";
const CSRF_MAX_AGE_SECONDS = 60 * 60 * 12;

export function isCsrfProtectionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CSRF_PROTECTION_ENABLED === "true";
}

export function issueCsrfToken(): string {
  return createOpaqueToken(24);
}

export function csrfCookieOptions() {
  return {
    httpOnly: true,
    secure: shouldUseSecureCookies(),
    sameSite: "strict" as const,
    path: "/",
    maxAge: CSRF_MAX_AGE_SECONDS,
  };
}

export function setCsrfCookie(response: NextResponse, token: string): void {
  response.cookies.set(CSRF_COOKIE_NAME, token, csrfCookieOptions());
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function hasValidCsrfToken(request: NextRequest): boolean {
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;

  if (!headerToken || !cookieToken) {
    return false;
  }

  return safeEqual(headerToken, cookieToken);
}

export function assertCsrf(request: NextRequest): void {
  if (!isCsrfProtectionEnabled()) {
    return;
  }

  if (!hasValidCsrfToken(request)) {
    throw apiError("Forbidden", { status: 403 });
  }
}

function readRequestOrigin(request: Request): string | null {
  const originHeader = request.headers.get("origin");
  if (originHeader) {
    return originHeader;
  }

  const refererHeader = request.headers.get("referer");
  if (!refererHeader) {
    return null;
  }

  try {
    return new URL(refererHeader).origin;
  } catch {
    return null;
  }
}

export function hasTrustedOrigin(request: Request, env: NodeJS.ProcessEnv = process.env): boolean {
  const requestOrigin = readRequestOrigin(request);
  if (!requestOrigin) {
    return false;
  }

  try {
    const expectedOrigin = new URL(getCanonicalBaseUrl(request, env)).origin;
    return requestOrigin === expectedOrigin;
  } catch {
    return false;
  }
}
