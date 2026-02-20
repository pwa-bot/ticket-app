import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readSource(relativePath: string): Promise<string> {
  return readFile(path.resolve("src", relativePath), "utf8");
}

test("auth redirect guards are limited to onboarding/settings pages", async () => {
  const guardedPages = [
    "app/space/settings/page.tsx",
    "app/space/onboarding/page.tsx",
    "app/space/onboarding/callback/page.tsx",
  ];

  for (const page of guardedPages) {
    const source = await readSource(page);
    assert.match(source, /buildGithubAuthPath\(/, `${page} should build auth redirect with returnTo`);
    assert.match(source, /withSearchParams\(/, `${page} should preserve query params in returnTo`);
    assert.doesNotMatch(source, /redirect\(["']\/api\/auth\/github["']\)/, `${page} should not use bare /api/auth/github redirect`);
  }
});

test("/api/auth/github validates and honors returnTo", async () => {
  const source = await readSource("app/api/auth/github/route.ts");

  assert.match(source, /normalizeReturnTo\(/, "auth route should sanitize requested returnTo values");
  assert.match(source, /createOAuthStateBinding\(/, "auth route should bind returnTo to oauth state");
  assert.match(source, /validateOAuthStateBinding\(/, "auth route should validate oauth state binding");
  assert.match(source, /cookieNames\.oauthReturnTo/, "auth route should persist returnTo across OAuth round-trip");
  assert.match(source, /const finalReturnTo = cookieReturnTo;/, "auth callback should use only cookie-bound returnTo");
  assert.doesNotMatch(source, /url\.searchParams\.get\("returnTo"\)\s*\?\?\s*cookieReturnTo/, "auth callback should not allow query returnTo override");
  assert.match(source, /toCanonicalUrl\(request, requestedReturnTo\)/, "existing sessions should be redirected to returnTo on canonical host");
  assert.match(source, /hasSessionCookieInRequest\(request\)\s*\|\|\s*await hasSession\(\)/, "auth route should short-circuit OAuth when session cookie already exists");
  assert.match(source, /response\.cookies\.set\(cookieNames\.oauthReturnTo, "", expiredCookieOptions\(\)\)/, "oauth returnTo cookie should be cleared after login");
});

test("primary /space pages do not hard-redirect to GitHub auth", async () => {
  const nonGuardedPages = [
    "app/space/page.tsx",
    "app/space/[owner]/[repo]/page.tsx",
    "app/space/[owner]/[repo]/[id]/page.tsx",
  ];

  for (const page of nonGuardedPages) {
    const source = await readSource(page);
    assert.doesNotMatch(source, /buildGithubAuthPath\(/, `${page} should not auto-redirect into OAuth during normal navigation`);
    assert.doesNotMatch(source, /hasSessionCookie\(/, `${page} should not enforce session-cookie guard in server page shell`);
  }
});

test("/api/repos stays read-only and cache-only", async () => {
  const source = await readSource("app/api/repos/route.ts");

  assert.match(source, /Cache-only repository list/, "repos GET should document cache-only behavior");
  assert.doesNotMatch(source, /fetch\(/, "repos GET should not call GitHub/network");
  assert.doesNotMatch(source, /hydrateInstallationRepos\(/, "repos GET should not hydrate on read");
  assert.doesNotMatch(source, /\.insert\(/, "repos GET should not write to DB");
  assert.doesNotMatch(source, /\.update\(/, "repos GET should not write to DB");
  assert.doesNotMatch(source, /\.delete\(/, "repos GET should not write to DB");
});

test("explicit refresh remains the sync trigger for installation hydration", async () => {
  const refreshRouteSource = await readSource("app/api/github/installations/refresh/route.ts");
  const helperSource = await readSource("lib/github/hydrate-installation-repos.ts");

  assert.match(helperSource, /\/user\/installations\/\$\{githubInstallationId\}\/repositories/, "hydration helper should use GitHub installation repositories endpoint");
  assert.match(refreshRouteSource, /hydrateInstallationRepos\(/, "installations refresh endpoint should hydrate via shared helper");
  assert.match(refreshRouteSource, /hydratedRepoCount/, "refresh response should report hydration work");
});

test("/api/github/installations stays cache-first and does not trigger background GitHub calls", async () => {
  const source = await readSource("app/api/github/installations/route.ts");

  assert.doesNotMatch(source, /api\.github\.com\/user\/installations/, "installations GET should not call GitHub directly");
  assert.doesNotMatch(source, /fetch\(/, "installations GET should not perform network reads");
  assert.doesNotMatch(source, /\.insert\(/, "installations GET should not write to DB");
  assert.doesNotMatch(source, /\.update\(/, "installations GET should not write to DB");
  assert.doesNotMatch(source, /\.delete\(/, "installations GET should not write to DB");
  assert.match(source, /Use POST \/api\/github\/installations\/refresh for explicit, rate-safe refresh\./, "installations GET should document explicit refresh path");
  assert.match(source, /db\.query\.installations\.findMany/, "installations GET should read from DB snapshot");
});

test("passive /api/space GET endpoints stay read-only and avoid GitHub/network calls", async () => {
  const passiveSpaceRoutes = [
    "app/api/space/index/route.ts",
    "app/api/space/tickets/route.ts",
    "app/api/space/attention/route.ts",
    "app/api/space/sync-health/route.ts",
    "app/api/space/repos/[owner]/[repo]/board/route.ts",
    "app/api/space/repos/[owner]/[repo]/sync-health/route.ts",
  ];

  for (const routePath of passiveSpaceRoutes) {
    const source = await readSource(routePath);
    assert.match(source, /export async function GET\(/, `${routePath} should expose GET`);
    assert.doesNotMatch(source, /fetch\(/, `${routePath} should not perform network reads`);
    assert.doesNotMatch(source, /\.insert\(/, `${routePath} should not write to DB`);
    assert.doesNotMatch(source, /\.update\(/, `${routePath} should not write to DB`);
    assert.doesNotMatch(source, /\.delete\(/, `${routePath} should not write to DB`);
  }
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


test("/api/auth routes use canonical base url and preserve returnTo in reconnect flow", async () => {
  const githubSource = await readSource("app/api/auth/github/route.ts");
  const reconnectSource = await readSource("app/api/auth/reconnect/route.ts");

  assert.match(githubSource, /getCanonicalBaseUrl\(request\)/, "auth callback redirect_uri should use canonical base url");
  assert.match(githubSource, /toCanonicalUrl\(request, redirectTo\)/, "post-login redirects should stay on canonical host");

  assert.match(reconnectSource, /getCanonicalBaseUrl\(request\)/, "reconnect redirect_uri should use canonical base url");
  assert.match(reconnectSource, /createOAuthStateBinding\(/, "reconnect should bind returnTo to oauth state");
  assert.match(reconnectSource, /cookieNames\.oauthReturnTo/, "reconnect flow should preserve returnTo across OAuth callback");
});
