import { randomBytes } from "node:crypto";

const WEEK_SECONDS = 60 * 60 * 24 * 7;
const TEN_MINUTES_SECONDS = 60 * 10;
const DAY_SECONDS = 60 * 60 * 24;

export function shouldUseSecureCookies(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== "development";
}
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: shouldUseSecureCookies(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: WEEK_SECONDS,
  };
}

export function oauthStateCookieOptions() {
  return {
    httpOnly: true,
    secure: shouldUseSecureCookies(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: TEN_MINUTES_SECONDS,
  };
}

export function selectedRepoCookieOptions() {
  return {
    httpOnly: true,
    secure: shouldUseSecureCookies(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: DAY_SECONDS,
  };
}

export function expiredCookieOptions(sameSite: "lax" | "strict" = "lax") {
  return {
    httpOnly: true,
    secure: shouldUseSecureCookies(),
    sameSite,
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  };
}

export function createOpaqueToken(size = 32): string {
  return randomBytes(size).toString("base64url");
}
