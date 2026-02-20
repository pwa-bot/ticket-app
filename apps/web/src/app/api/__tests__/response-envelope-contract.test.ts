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

test("API routes do not use raw NextResponse.json calls", async () => {
  const routeFiles = await collectRouteFiles(API_ROOT);
  const offenders: string[] = [];

  for (const routeFile of routeFiles) {
    const source = await readFile(routeFile, "utf8");
    if (source.includes("NextResponse.json(")) {
      offenders.push(path.relative(path.resolve("src"), routeFile));
    }
  }

  assert.deepEqual(offenders, []);
});
