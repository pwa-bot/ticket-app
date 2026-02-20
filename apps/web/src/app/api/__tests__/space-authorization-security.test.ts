import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readSource(relativePath: string): Promise<string> {
  return readFile(path.resolve("src", relativePath), "utf8");
}

const cacheBackedSpaceRoutes = [
  "app/api/space/index/route.ts",
  "app/api/space/attention/route.ts",
  "app/api/space/tickets/route.ts",
] as const;

test("cache-backed /api/space routes enforce installation-scoped repo authorization", async () => {
  for (const routePath of cacheBackedSpaceRoutes) {
    const source = await readSource(routePath);

    assert.match(source, /requireSession\(/, `${routePath} should require an authenticated session`);
    assert.match(source, /listAccessibleRepos\(\{ userId, enabledOnly: true \}\)/, `${routePath} should derive repo access from authenticated user's installations`);
    assert.match(source, /assertNoUnauthorizedRepos\(/, `${routePath} should reject unauthorized repo filters`);
    assert.doesNotMatch(source, /githubAccountLogin/, `${routePath} should not use owner-login fallback for authorization`);
    assert.doesNotMatch(source, /schema\.installations/, `${routePath} should not authorize from installations table owner login matching`);
    assert.doesNotMatch(source, /schema\.repos\.owner/, `${routePath} should not authorize via repo owner login fallback`);
  }
});

test("repo-specific /api/space routes enforce server-side repo guards", async () => {
  const boardSource = await readSource("app/api/space/repos/[owner]/[repo]/board/route.ts");
  const refreshSource = await readSource("app/api/space/repos/[owner]/[repo]/refresh/route.ts");

  assert.match(boardSource, /requireRepoAccess\(/, "board route should enforce repo access guard");
  assert.match(refreshSource, /requireRepoAccess\(/, "refresh route should enforce repo access guard");
});

test("/api/space/jobs/refresh remains secret-protected for server-side workers", async () => {
  const source = await readSource("app/api/space/jobs/refresh/route.ts");

  assert.match(source, /function isAuthorized\(/, "jobs refresh should check bearer secret");
  assert.match(source, /Authorization: Bearer <REFRESH_JOBS_SECRET>/, "jobs refresh should document bearer auth requirement");
});
