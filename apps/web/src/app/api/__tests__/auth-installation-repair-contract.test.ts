import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readSource(relativePath: string): Promise<string> {
  return readFile(path.resolve("src", relativePath), "utf8");
}

test("admin/dev diagnostic + repair endpoints are present and guarded", async () => {
  const diagnoseSource = await readSource("app/api/admin/connection/diagnose/route.ts");
  const repairSource = await readSource("app/api/admin/connection/repair/route.ts");

  assert.match(diagnoseSource, /ensureAdminOrDev\(/, "diagnose endpoint should enforce admin/dev guard");
  assert.match(diagnoseSource, /getConnectionDiagnosticSnapshot\(/, "diagnose endpoint should return canonical snapshot");

  assert.match(repairSource, /ensureAdminOrDev\(/, "repair endpoint should enforce admin/dev guard");
  assert.match(repairSource, /repairConnectionState\(/, "repair endpoint should invoke repair workflow");
  assert.match(repairSource, /dryRun/, "repair endpoint should support dryRun");
});

test("repair service removes stale links and attempts safe repo relink", async () => {
  const source = await readSource("lib/connection-recovery.ts");

  assert.match(source, /delete\(schema\.userInstallations\)/, "repair should remove stale user-installation links");
  assert.match(source, /update\(schema\.repos\)/, "repair should update repo installation linkage");
  assert.match(source, /NO_MATCHING_INSTALLATION_FOR_OWNER/, "repair should flag unresolved owner mismatch");
  assert.match(source, /MULTIPLE_MATCHING_INSTALLATIONS/, "repair should flag ambiguous relink candidates");
});

test("oauth reconnect and installation refresh linkage remain explicit", async () => {
  const authGithubSource = await readSource("app/api/auth/github/route.ts");
  const refreshSource = await readSource("app/api/github/installations/refresh/route.ts");

  assert.match(authGithubSource, /insert\(schema\.userInstallations\)/, "oauth callback should relink user_installations");
  assert.match(authGithubSource, /onConflictDoNothing\(\)/, "oauth callback relink should be idempotent");

  assert.match(refreshSource, /insert\(schema\.userInstallations\)/, "installations refresh should upsert user-installation linkage");
  assert.match(refreshSource, /hydrateInstallationRepos\(/, "refresh should hydrate repos after linking installations");
});
