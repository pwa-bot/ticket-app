import assert from "node:assert/strict";
import test from "node:test";
import { computeSyncHealth, formatDurationShort } from "@/lib/sync-health";

test("computeSyncHealth marks healthy when synced within threshold", () => {
  const now = Date.parse("2026-02-20T12:00:00.000Z");
  const lastSyncedAt = new Date("2026-02-20T11:00:00.000Z");

  const health = computeSyncHealth(
    { syncStatus: "idle", syncError: null, lastSyncedAt },
    { nowMs: now, staleAfterMs: 2 * 60 * 60 * 1000 },
  );

  assert.equal(health.state, "healthy");
  assert.equal(health.isStale, false);
  assert.equal(health.ageMs, 60 * 60 * 1000);
  assert.equal(health.staleAgeMs, 0);
});

test("computeSyncHealth marks stale and returns stale age", () => {
  const now = Date.parse("2026-02-20T12:00:00.000Z");
  const lastSyncedAt = new Date("2026-02-20T06:00:00.000Z");

  const health = computeSyncHealth(
    { syncStatus: "idle", syncError: null, lastSyncedAt },
    { nowMs: now, staleAfterMs: 3 * 60 * 60 * 1000 },
  );

  assert.equal(health.state, "stale");
  assert.equal(health.isStale, true);
  assert.equal(health.ageMs, 6 * 60 * 60 * 1000);
  assert.equal(health.staleAgeMs, 3 * 60 * 60 * 1000);
});

test("computeSyncHealth prioritizes error state", () => {
  const now = Date.parse("2026-02-20T12:00:00.000Z");
  const lastSyncedAt = new Date("2026-02-20T11:59:00.000Z");

  const health = computeSyncHealth(
    { syncStatus: "error", syncError: "index_fetch_failed: GitHub API error: 500", lastSyncedAt },
    { nowMs: now, staleAfterMs: 60_000 },
  );

  assert.equal(health.state, "error");
  assert.equal(health.hasError, true);
  assert.match(health.errorMessage ?? "", /index_fetch_failed/);
});

test("computeSyncHealth marks never_synced without lastSyncedAt", () => {
  const health = computeSyncHealth(
    { syncStatus: "idle", syncError: null, lastSyncedAt: null },
    { nowMs: Date.parse("2026-02-20T12:00:00.000Z"), staleAfterMs: 60_000 },
  );

  assert.equal(health.state, "never_synced");
  assert.equal(health.ageMs, null);
  assert.equal(health.isStale, false);
});

test("formatDurationShort formats age buckets", () => {
  assert.equal(formatDurationShort(null), "n/a");
  assert.equal(formatDurationShort(5_000), "<1m");
  assert.equal(formatDurationShort(2 * 60 * 1000), "2m");
  assert.equal(formatDurationShort(3 * 60 * 60 * 1000), "3h");
  assert.equal(formatDurationShort(2 * 24 * 60 * 60 * 1000), "2d");
});
