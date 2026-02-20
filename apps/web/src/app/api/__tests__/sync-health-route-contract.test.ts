import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readSource(relativePath: string): Promise<string> {
  return readFile(path.resolve("src", relativePath), "utf8");
}

test("sync health routes compute health snapshot with age/staleness/error fields", async () => {
  const aggregateSource = await readSource("app/api/space/sync-health/route.ts");
  const repoSource = await readSource("app/api/space/repos/[owner]/[repo]/sync-health/route.ts");
  const legacySyncSource = await readSource("app/api/repos/[owner]/[repo]/sync/route.ts");

  assert.match(aggregateSource, /computeSyncHealth\(/, "space sync-health endpoint should derive health from shared helper");
  assert.match(aggregateSource, /staleThresholdMs/, "space sync-health endpoint should expose staleness threshold");
  assert.match(aggregateSource, /error/, "space sync-health endpoint should include error summary state");

  assert.match(repoSource, /computeSyncHealth\(/, "repo sync-health endpoint should derive health from shared helper");
  assert.match(repoSource, /lastSyncedAt/, "repo sync-health endpoint should expose last synced timestamp");
  assert.match(repoSource, /requireRepoAccess\(/, "repo sync-health endpoint should enforce repo access");

  assert.match(legacySyncSource, /syncHealth:/, "legacy repo sync endpoint should include syncHealth payload");
});
