import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const API_ROOT = path.resolve("src/app/api");

async function collectRouteFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectRouteFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && entry.name === "route.ts") {
      files.push(fullPath);
    }
  }

  return files;
}

function isUserScopedRouteSource(source: string): boolean {
  return source.includes("requireSession(") || source.includes("requireRepoAccess(");
}

function isJsonRouteSource(source: string): boolean {
  return source.includes("apiSuccess(") || source.includes("apiError(");
}

test("user-scoped JSON routes stay dynamic and rely on hardened api response helpers", async () => {
  const routeFiles = await collectRouteFiles(API_ROOT);
  const userScopedRoutes: string[] = [];

  for (const routeFile of routeFiles) {
    const source = await readFile(routeFile, "utf8");
    if (!isUserScopedRouteSource(source) || !isJsonRouteSource(source)) {
      continue;
    }

    const relativeRoute = path.relative(path.resolve("src"), routeFile);
    userScopedRoutes.push(relativeRoute);

    assert.doesNotMatch(
      source,
      /export const dynamic\s*=\s*['"]force-static['"]/,
      `${relativeRoute} must not opt into static caching`,
    );
    assert.doesNotMatch(
      source,
      /export const revalidate\s*=/,
      `${relativeRoute} must not configure revalidation-based caching`,
    );
    assert.doesNotMatch(
      source,
      /cache-control\s*:\s*['"`]\s*(public|s-maxage|max-age=\d+)/i,
      `${relativeRoute} must not set cacheable cache-control directives`,
    );
  }

  assert.ok(userScopedRoutes.length > 0, "Expected to discover at least one user-scoped route");
});
