import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readSource(relativePath: string): Promise<string> {
  return readFile(path.resolve("src", relativePath), "utf8");
}

test("unauthenticated /space routes redirect to /api/auth/github with returnTo", async () => {
  const protectedSpacePages = [
    "app/space/page.tsx",
    "app/space/settings/page.tsx",
    "app/space/[owner]/[repo]/page.tsx",
    "app/space/[owner]/[repo]/[id]/page.tsx",
    "app/space/onboarding/page.tsx",
    "app/space/onboarding/callback/page.tsx",
  ];

  for (const page of protectedSpacePages) {
    const source = await readSource(page);
    assert.match(source, /buildGithubAuthPath\(/, `${page} should build auth redirect with returnTo`);
    assert.match(source, /withSearchParams\(/, `${page} should preserve query params in returnTo`);
    assert.doesNotMatch(source, /redirect\(["']\/api\/auth\/github["']\)/, `${page} should not use bare /api/auth/github redirect`);
  }
});

test("/api/auth/github validates and honors returnTo", async () => {
  const source = await readSource("app/api/auth/github/route.ts");

  assert.match(source, /normalizeReturnTo\(/, "auth route should sanitize requested returnTo values");
  assert.match(source, /cookieNames\.oauthReturnTo/, "auth route should persist returnTo across OAuth round-trip");
  assert.match(source, /const finalReturnTo = normalizeReturnTo\(/, "auth route should compute final safe returnTo");
  assert.match(source, /NextResponse\.redirect\(new URL\(requestedReturnTo, request\.url\)\)/, "existing sessions should be redirected to returnTo");
  assert.match(source, /response\.cookies\.set\(cookieNames\.oauthReturnTo, "", expiredCookieOptions\(\)\)/, "oauth returnTo cookie should be cleared after login");
});

test("/api/repos self-heals stale user_installations and returns repos across refreshed links", async () => {
  const source = await readSource("app/api/repos/route.ts");

  assert.match(source, /fetch\(["']https:\/\/api\.github\.com\/user\/installations["']/, "should refresh installations from GitHub user/installations endpoint");
  assert.match(source, /Authorization:\s*`Bearer \$\{token\}`/, "should call GitHub with the signed-in user token");
  assert.match(source, /insert\(schema\.userInstallations\)[\s\S]*onConflictDoNothing\(\)/, "should upsert user_installations links to recover from stale mappings");
  assert.match(source, /const userInstallations = await db\.query\.userInstallations\.findMany/, "should load user installation links after refresh");
  assert.match(source, /const repos = await db\.query\.repos\.findMany\([\s\S]*inArray\(schema\.repos\.installationId, installationIds\)/, "should include repos from all installation IDs linked to the user");
});

test("repo navigation uses Next Link components for in-app routing", async () => {
  const repoLinkComponents = ["components/repo-picker.tsx", "components/repo-selector.tsx"];

  for (const componentPath of repoLinkComponents) {
    const source = await readSource(componentPath);
    assert.match(source, /import\s+Link\s+from\s+["']next\/link["']/, `${componentPath} should import next/link`);
    assert.match(source, /<Link[\s\S]*href=\{`\/space\/\$\{encodeURIComponent\(owner\)\}\/\$\{encodeURIComponent\(name\)\}`\}/, `${componentPath} should use <Link> for repo routes`);
    assert.doesNotMatch(source, /<a\s+[^>]*href=\{`\/space\//, `${componentPath} should not use raw <a> for repo routes`);
  }
});
