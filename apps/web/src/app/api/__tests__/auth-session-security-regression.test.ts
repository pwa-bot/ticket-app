import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readSource(relativePath: string): Promise<string> {
  return readFile(path.resolve("src", relativePath), "utf8");
}

test("auth sessions are stored server-side and cookies stay opaque", async () => {
  const authSource = await readSource("lib/auth.ts");

  assert.match(authSource, /createAuthSession\(/, "auth should create DB-backed sessions");
  assert.match(authSource, /db\.query\.authSessions\.findFirst/, "auth should resolve sessions from DB");
  assert.match(authSource, /isOpaqueSessionId\(/, "auth should validate opaque session ids");
  assert.doesNotMatch(authSource, /JSON\.parse\(decrypted\)/, "auth should no longer decode cookie JSON payloads containing tokens");
});

test("oauth callback writes opaque session id cookie", async () => {
  const source = await readSource("app/api/auth/github/route.ts");

  assert.match(source, /createAuthSession\(/, "oauth callback should persist server-side auth session");
  assert.match(source, /response\.cookies\.set\(cookieNames\.session, sessionId, sessionCookieOptions\(\)\)/, "session cookie should store opaque session id");
  assert.doesNotMatch(source, /encryptToken\(sessionData\)/, "oauth callback should not store access token in cookie");
});

test("logout and reconnect clear both cookie and server session", async () => {
  const logoutSource = await readSource("app/api/auth/logout/route.ts");
  const reconnectSource = await readSource("app/api/auth/reconnect/route.ts");
  const refreshSource = await readSource("app/api/github/installations/refresh/route.ts");
  const mutationGuardSource = await readSource("lib/security/mutation-guard.ts");

  assert.match(logoutSource, /export async function POST\(/, "logout should be POST-only");
  assert.doesNotMatch(logoutSource, /export async function GET\(/, "logout should not expose GET");
  assert.match(logoutSource, /destroySessionById\(getSessionIdFromRequest\(request\)\)/, "logout should delete server session row");
  assert.match(logoutSource, /applyMutationGuards\(/, "logout should enforce mutation guards");

  assert.match(reconnectSource, /export async function POST\(/, "reconnect should be POST-only");
  assert.doesNotMatch(reconnectSource, /export async function GET\(/, "reconnect should not expose GET");
  assert.match(reconnectSource, /destroySessionById\(getSessionIdFromRequest\(request\)\)/, "reconnect should delete stale server session row");
  assert.match(reconnectSource, /applyMutationGuards\(/, "reconnect should enforce mutation guards");

  assert.match(refreshSource, /applyMutationGuards\(/, "installations refresh should enforce mutation guards");
  assert.match(mutationGuardSource, /hasTrustedOrigin\(/, "mutation guard should validate Origin/Referer");
  assert.match(mutationGuardSource, /hasValidCsrfToken\(/, "mutation guard should enforce CSRF token checks");
});
