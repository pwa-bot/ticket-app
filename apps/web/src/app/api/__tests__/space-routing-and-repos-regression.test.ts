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

test("/api/repos is cache-first by default and does not unconditionally call GitHub installations API", async () => {
  const source = await readSource("app/api/repos/route.ts");

  assert.match(source, /const refresh = shouldRefresh\(request\)/, "should gate refresh behavior behind an explicit refresh flag");
  assert.match(source, /if \(refresh\) \{[\s\S]*syncUserInstallationsFromGithub\(userId, token\)/, "should only sync installations when refresh is requested");
  assert.match(source, /installationsToHydrate = refresh[\s\S]*: installationIds\.filter\(\(id\) => !installationsWithRepos\.has\(id\)\)/, "default path should hydrate only installations with zero cached repos");
});

test("refresh flows hydrate repos for personal installations so repo list can include newly installed repos", async () => {
  const reposRouteSource = await readSource("app/api/repos/route.ts");
  const refreshRouteSource = await readSource("app/api/github/installations/refresh/route.ts");

  assert.match(reposRouteSource, /\/user\/installations\/\$\{githubInstallationId\}\/repositories/, "repos route should support hydration from GitHub installation repositories endpoint");
  assert.match(refreshRouteSource, /hydrateReposForInstallation\(/, "installations refresh endpoint should hydrate repos");
  assert.match(refreshRouteSource, /hydratedRepoCount/, "refresh response should report hydration work");
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
