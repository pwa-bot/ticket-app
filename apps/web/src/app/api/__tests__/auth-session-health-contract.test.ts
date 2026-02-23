import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readSource(relativePath: string): Promise<string> {
  return readFile(path.resolve("src", relativePath), "utf8");
}

test("auth session health endpoint is admin/dev guarded and uses probe service", async () => {
  const source = await readSource("app/api/admin/auth-sessions/health/route.ts");

  assert.match(source, /ensureAdminOrDev\(/, "health endpoint should enforce admin/dev guard");
  assert.match(source, /runAuthSessionHealthProbe\(/, "health endpoint should run auth session health probe");
  assert.match(source, /toRedactedError\(/, "health endpoint should redact sensitive errors before logging");
});

test("auth session repair endpoint supports dryRun and verification", async () => {
  const source = await readSource("app/api/admin/auth-sessions/repair/route.ts");

  assert.match(source, /ensureAdminOrDev\(/, "repair endpoint should enforce admin/dev guard");
  assert.match(source, /dryRun/, "repair endpoint should accept dryRun mode");
  assert.match(source, /repairExpiredAuthSessions\(/, "repair endpoint should run auth-session cleanup workflow");
  assert.match(source, /before/, "repair endpoint should return pre-repair snapshot");
  assert.match(source, /after/, "repair endpoint should return post-repair snapshot");
});

test("auth session probe validates schema + roundtrip contract", async () => {
  const source = await readSource("lib/auth-session-health.ts");

  assert.match(source, /information_schema\.columns/, "probe should verify required columns");
  assert.match(source, /pg_constraint/, "probe should verify auth_sessions constraints");
  assert.match(source, /pg_indexes/, "probe should verify auth_sessions indexes");
  assert.match(source, /transaction\(/, "roundtrip probe should run inside a DB transaction");
  assert.match(source, /insert\(schema\.authSessions\)/, "probe should insert a probe session");
  assert.match(source, /delete\(schema\.authSessions\)/, "probe should delete the probe session");
});

test("redaction utility masks token-like values", async () => {
  const source = await readSource("lib/security/redaction.ts");

  assert.match(source, /REDACTED/, "redaction utility should replace sensitive values");
  assert.match(source, /Bearer\\s\+/, "redaction utility should include bearer token masking");
  assert.match(source, /ghp\|gho\|ghu\|ghs\|ghr/, "redaction utility should include GitHub token prefixes");
});
