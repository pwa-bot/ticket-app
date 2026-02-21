import assert from "node:assert/strict";
import test from "node:test";
import {
  createVersionedTicketIndexSnapshot,
  parseVersionedTicketIndexSnapshot,
  shouldFallbackToLastKnownGoodSnapshot,
  type VersionedTicketIndexSnapshot,
} from "@/lib/derived-cache-snapshot";

test("createVersionedTicketIndexSnapshot round-trips with integrity hash", () => {
  const snapshot = createVersionedTicketIndexSnapshot({
    repoId: "repo-1",
    repoFullName: "acme/repo",
    headSha: "head-123",
    indexSha: "index-123",
    capturedAt: new Date("2026-02-20T12:00:00.000Z"),
    payload: {
      format_version: 1,
      tickets: [{ id: "01KHVX923A", title: "Ticket", state: "ready", priority: "p1" }],
    },
  });

  const parsed = parseVersionedTicketIndexSnapshot(snapshot);
  assert.ok(parsed);
  assert.equal(parsed?.snapshotVersion, 1);
  assert.equal(parsed?.payload.tickets.length, 1);
  assert.equal(parsed?.payloadHash.length, 64);
});

test("parseVersionedTicketIndexSnapshot rejects tampered payload hash", () => {
  const snapshot = createVersionedTicketIndexSnapshot({
    repoId: "repo-1",
    repoFullName: "acme/repo",
    headSha: "head-123",
    indexSha: "index-123",
    capturedAt: new Date("2026-02-20T12:00:00.000Z"),
    payload: {
      format_version: 1,
      tickets: [{ id: "01KHVX923A", title: "Ticket", state: "ready", priority: "p1" }],
    },
  });

  const tampered: VersionedTicketIndexSnapshot = {
    ...snapshot,
    payload: {
      ...snapshot.payload,
      tickets: [{ id: "01KHVX923A", title: "Changed", state: "ready", priority: "p1" }],
    },
  };

  const parsed = parseVersionedTicketIndexSnapshot(tampered);
  assert.equal(parsed, null);
});

test("shouldFallbackToLastKnownGoodSnapshot falls back for corruption", () => {
  const decision = shouldFallbackToLastKnownGoodSnapshot({
    sync: {
      syncStatus: "idle",
      syncError: null,
      lastSyncedAt: new Date("2026-02-21T09:00:00.000Z"),
    },
    ticketCount: 10,
    hasCorruption: true,
    nowMs: Date.parse("2026-02-21T09:05:00.000Z"),
    staleAfterMs: 60 * 60 * 1000,
  });

  assert.equal(decision.shouldFallback, true);
  assert.equal(decision.reason, "cache_corrupted");
});

test("shouldFallbackToLastKnownGoodSnapshot falls back for stale cache", () => {
  const decision = shouldFallbackToLastKnownGoodSnapshot({
    sync: {
      syncStatus: "idle",
      syncError: null,
      lastSyncedAt: new Date("2026-02-20T00:00:00.000Z"),
    },
    ticketCount: 10,
    hasCorruption: false,
    nowMs: Date.parse("2026-02-21T09:00:00.000Z"),
    staleAfterMs: 6 * 60 * 60 * 1000,
  });

  assert.equal(decision.shouldFallback, true);
  assert.equal(decision.reason, "stale_cache");
});

test("shouldFallbackToLastKnownGoodSnapshot does not fallback for healthy cache", () => {
  const decision = shouldFallbackToLastKnownGoodSnapshot({
    sync: {
      syncStatus: "idle",
      syncError: null,
      lastSyncedAt: new Date("2026-02-21T08:30:00.000Z"),
    },
    ticketCount: 10,
    hasCorruption: false,
    nowMs: Date.parse("2026-02-21T09:00:00.000Z"),
    staleAfterMs: 6 * 60 * 60 * 1000,
  });

  assert.equal(decision.shouldFallback, false);
  assert.equal(decision.reason, null);
});
