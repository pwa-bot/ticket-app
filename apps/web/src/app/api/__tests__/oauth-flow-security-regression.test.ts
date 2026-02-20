import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readSource(relativePath: string): Promise<string> {
  return readFile(path.resolve("src", relativePath), "utf8");
}

test("oauth callback rejects invalid state and clears stale oauth cookies", async () => {
  const source = await readSource("app/api/auth/github/route.ts");

  assert.match(source, /validateOAuthStateBinding\(/, "callback should validate oauth state binding");
  assert.match(source, /apiError\("Invalid OAuth state", \{ status: 400 \}\)/, "callback should fail invalid state with 400");
  assert.match(source, /response\.cookies\.set\(cookieNames\.oauthState, "", expiredCookieOptions\(\)\)/, "invalid state should clear oauth state cookie");
  assert.match(source, /response\.cookies\.set\(cookieNames\.oauthReturnTo, "", expiredCookieOptions\(\)\)/, "invalid state should clear oauth returnTo cookie");
});

test("oauth returnTo sanitizer uses explicit allowlist and blocks non-space paths", async () => {
  const source = await readSource("lib/auth-return-to.ts");

  assert.match(source, /AUTH_RETURN_TO_ALLOWLIST_PREFIXES = \["\/space", "\/board", "\/repos"\]/, "returnTo should use explicit allowlist prefixes");
  assert.match(source, /parsed\.pathname === prefix \|\| parsed\.pathname\.startsWith\(`\$\{prefix\}\/`\)/, "allowlist should only permit exact prefix or descendants");
});

test("oauth install callback keeps returnTo normalized before redirect", async () => {
  const source = await readSource("app/api/auth/github/install/route.ts");

  assert.match(source, /const returnTo = normalizeReturnTo\(/, "install callback should normalize returnTo");
  assert.match(source, /NextResponse\.redirect\(new URL\(returnTo, request\.url\)\)/, "install callback redirects should use normalized returnTo");
});
