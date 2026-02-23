import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readSource(relativePath: string): Promise<string> {
  return readFile(path.resolve("src", relativePath), "utf8");
}

test("connection-state service defines canonical reason codes", async () => {
  const source = await readSource("lib/connection-state.ts");

  assert.match(source, /export type ConnectionFailureReasonCode =/, "connection-state should export canonical reason code union");
  assert.match(source, /"AUTH_REQUIRED"/, "reason codes should include missing auth");
  assert.match(source, /"GITHUB_APP_NOT_INSTALLED"/, "reason codes should include missing app install");
  assert.match(source, /"INSTALLATION_STATE_STALE"/, "reason codes should include stale installation state");
  assert.match(source, /"REPO_NOT_ENABLED"/, "reason codes should include no-enabled-repo state");
  assert.match(source, /export async function getConnectionState\(/, "connection-state should expose canonical service function");
});

test("settings and reconnect flows consume canonical connection-state service", async () => {
  const installationsRoute = await readSource("app/api/github/installations/route.ts");
  const reconnectRoute = await readSource("app/api/auth/reconnect/route.ts");
  const settingsClient = await readSource("components/settings/settings-client.tsx");
  const connectionStateRoute = await readSource("app/api/connection/state/route.ts");

  assert.match(installationsRoute, /getConnectionState\(/, "installations route should include canonical connection state payload");
  assert.match(installationsRoute, /connection,/, "installations route should return connection object");

  assert.match(connectionStateRoute, /export async function GET\(/, "connection state endpoint should provide canonical GET contract");
  assert.match(connectionStateRoute, /getConnectionState\(/, "connection state endpoint should delegate to canonical state service");
  assert.match(connectionStateRoute, /apiSuccess\(\{ connection \}\)/, "connection state endpoint should return wrapped connection object");

  assert.match(reconnectRoute, /status:\s*"reconnect_required"/, "reconnect should return deterministic reconnect status");
  assert.match(reconnectRoute, /reasonCode:/, "reconnect should include actionable reason code");
  assert.match(reconnectRoute, /reasonCode:\s*"oauth_not_configured"/, "reconnect should return explicit oauth_not_configured reason");

  assert.match(settingsClient, /fetch\("\/api\/connection\/state"\)/, "settings should use canonical connection-state endpoint");
  assert.doesNotMatch(settingsClient, /if \(iRes\.status === 401 \|\| iRes\.status === 403 \|\| reasonCode === "auth_required"\) \{\s*await reconnectWithPost\(currentPath\);/, "settings load should not auto-trigger reconnect loops");
  assert.match(settingsClient, /setShowReconnectCta\(/, "settings load should surface reconnect CTA instead of auto-looping");
  assert.match(settingsClient, /getConnectionReasonMessage\(/, "settings should map explicit connection reason codes");
  assert.match(settingsClient, /INSTALLATION_STATE_STALE/, "settings should surface stale-installation reason");
  assert.match(settingsClient, /INSTALLATION_REPO_MISMATCH/, "settings should surface installation-repo mismatch reason");
});

test("space attention + sync-health expose actionable auth failures", async () => {
  const attentionRoute = await readSource("app/api/space/attention/route.ts");
  const syncHealthRoute = await readSource("app/api/space/sync-health/route.ts");

  assert.match(attentionRoute, /reasonCode:\s*"auth_required"/, "attention route should include auth_required reason on 401/403");
  assert.match(attentionRoute, /action:\s*"reconnect"/, "attention route should include reconnect action hint");

  assert.match(syncHealthRoute, /reasonCode:\s*"auth_required"/, "sync-health route should include auth_required reason on 401/403");
  assert.match(syncHealthRoute, /action:\s*"reconnect"/, "sync-health route should include reconnect action hint");
});
