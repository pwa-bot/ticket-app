import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SyncHealthBadge } from "@/components/sync-health-badge";

test("SyncHealthBadge renders stale state with age", () => {
  const html = renderToStaticMarkup(
    createElement(SyncHealthBadge, {
      health: {
        state: "stale",
        syncStatus: "idle",
        lastSyncedAt: "2026-02-20T08:00:00.000Z",
        ageMs: 4 * 60 * 60 * 1000,
        staleAgeMs: 60 * 60 * 1000,
        staleAfterMs: 3 * 60 * 60 * 1000,
        isStale: true,
        hasError: false,
        errorMessage: null,
      },
    }),
  );

  assert.match(html, /Stale/);
  assert.match(html, /age 4h/);
});

test("SyncHealthBadge renders error message", () => {
  const html = renderToStaticMarkup(
    createElement(SyncHealthBadge, {
      health: {
        state: "error",
        syncStatus: "error",
        lastSyncedAt: "2026-02-20T11:00:00.000Z",
        ageMs: 60 * 60 * 1000,
        staleAgeMs: 0,
        staleAfterMs: 6 * 60 * 60 * 1000,
        isStale: false,
        hasError: true,
        errorMessage: "index_fetch_failed: GitHub API error: 500",
      },
    }),
  );

  assert.match(html, /Error/);
  assert.match(html, /index_fetch_failed/);
});
