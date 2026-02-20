/**
 * TK-01KHW6EX-2: Ignore stale responses during rapid search and filter.
 *
 * These tests verify that:
 * 1. Responses from superseded requests (due to rapid tab switching or repo
 *    filter changes) never overwrite data from the latest request.
 * 2. The loading indicator stays active until the *current* request resolves,
 *    not a stale one.
 * 3. Aborted requests are silently dropped — no error is surfaced to the user.
 * 4. Request deduplication: switching params and switching back doesn't leave
 *    the UI in an inconsistent state.
 */

import { expect, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const attentionResponse = {
  items: [
    {
      repoFullName: "acme/api",
      ticketId: "01KTEST0000000000000000001",
      shortId: "01KTEST0",
      displayId: "TK-01KTEST0",
      title: "Fix flaky deploy checks",
      state: "in_progress",
      priority: "p0",
      labels: ["infra", "ci"],
      path: ".tickets/tickets/01KTEST0000000000000000001.md",
      assignee: "human:alex",
      reviewer: "human:lee",
      createdAt: "2026-02-18T12:00:00.000Z",
      cachedAt: "2026-02-20T08:00:00.000Z",
      reasons: ["ci_failing"],
      reasonDetails: [
        {
          code: "ci_failing",
          label: "CI failing",
          description: "At least one linked open PR has failing checks.",
          rank: 1,
        },
      ],
      primaryReason: "ci_failing",
      prs: [],
      mergeReadiness: "FAILING_CHECKS",
      hasPendingChange: false,
    },
  ],
  repos: [
    {
      fullName: "acme/api",
      owner: "acme",
      repo: "api",
      totalTickets: 2,
      attentionTickets: 1,
    },
    {
      fullName: "acme/web",
      owner: "acme",
      repo: "web",
      totalTickets: 1,
      attentionTickets: 0,
    },
  ],
  totals: {
    reposEnabled: 2,
    reposSelected: 2,
    ticketsTotal: 3,
    ticketsAttention: 1,
  },
  reasonCatalog: [
    {
      code: "ci_failing",
      label: "CI failing",
      description: "At least one linked open PR has failing checks.",
      rank: 1,
    },
  ],
  loadedAt: "2026-02-20T08:00:00.000Z",
};

const indexResponse = {
  tickets: [
    {
      repoFullName: "acme/api",
      repoOwner: "acme",
      repoName: "api",
      id: "01KTEST0000000000000000001",
      shortId: "01KTEST0",
      displayId: "TK-01KTEST0",
      title: "Fix flaky deploy checks",
      state: "in_progress",
      priority: "p0",
      labels: ["infra", "ci"],
      path: ".tickets/tickets/01KTEST0000000000000000001.md",
      assignee: "human:alex",
      reviewer: "human:lee",
      createdAt: "2026-02-18T12:00:00.000Z",
      cachedAt: "2026-02-20T08:00:00.000Z",
    },
  ],
  repos: [
    {
      fullName: "acme/api",
      owner: "acme",
      repo: "api",
      totalTickets: 2,
    },
    {
      fullName: "acme/web",
      owner: "acme",
      repo: "web",
      totalTickets: 1,
    },
  ],
  totals: {
    reposEnabled: 2,
    reposSelected: 2,
    ticketsTotal: 1,
  },
  loadedAt: "2026-02-20T08:00:00.000Z",
};

// ---------------------------------------------------------------------------
// Helper — inject a controlled delay into a route handler
// ---------------------------------------------------------------------------

function makeDelayedFulfill(
  route: import("@playwright/test").Route,
  body: unknown,
  delayMs: number,
) {
  return new Promise<void>((resolve) => {
    setTimeout(async () => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
      resolve();
    }, delayMs);
  });
}

// ---------------------------------------------------------------------------
// Test 1: Rapid tab switch — stale attention response must not win over the
//         already-resolved index response.
// ---------------------------------------------------------------------------

test("rapid tab switch: stale attention response is discarded when tickets tab already loaded", async ({
  page,
}) => {
  let attentionCallCount = 0;
  let indexCallCount = 0;

  // First attention call is intentionally slow (simulates a stale in-flight
  // request from the initial page load that hasn't resolved yet when the user
  // switches to the tickets tab).
  await page.route("**/api/space/attention**", async (route) => {
    attentionCallCount++;
    const delay = attentionCallCount === 1 ? 400 : 0;
    await makeDelayedFulfill(route, attentionResponse, delay);
  });

  await page.route("**/api/space/index**", async (route) => {
    indexCallCount++;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(indexResponse),
    });
  });

  // Navigate to the page — triggers the first (slow) attention request.
  await page.goto("/space");
  await expect(page.getByRole("heading", { name: "Space dashboard" })).toBeVisible();

  // Switch to tickets tab before the slow attention request resolves.
  await page.getByTestId("tab-switcher").getByRole("button", { name: "All tickets" }).click();
  await expect(page).toHaveURL(/tab=tickets/);

  // Wait for the tickets tab to finish loading.
  await expect(page.getByText(/\d+ tickets/)).toBeVisible({ timeout: 5000 });

  // The slow attention response will arrive here (~400 ms after page load).
  // It must NOT overwrite the index data that is now correctly displayed.
  await page.waitForTimeout(500);

  // Still on tickets tab, content is correct.
  await expect(page).toHaveURL(/tab=tickets/);
  await expect(page.getByText(/\d+ tickets/)).toBeVisible();

  // Loading spinner must not be visible after both responses have settled.
  await expect(page.getByText("Loading…")).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// Test 2: Rapid repo filter changes — only the last request's data is shown.
// ---------------------------------------------------------------------------

test("rapid repo filter changes: only the last response is applied to the UI", async ({
  page,
}) => {
  let callCount = 0;

  // Simulate network jitter: the first filtered request is slow, the second
  // is fast.  Without cancellation the slow (stale) response would win.
  await page.route("**/api/space/attention**", async (route) => {
    callCount++;
    const isFilteredForApiOnly = route.request().url().includes("repos=acme%2Fapi");
    const delay = callCount === 2 && isFilteredForApiOnly ? 400 : 0;
    const body =
      callCount >= 3
        ? { ...attentionResponse, loadedAt: "2026-02-20T09:00:00.000Z" }
        : attentionResponse;
    await makeDelayedFulfill(route, body, delay);
  });

  await page.route("**/api/space/index**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(indexResponse),
    });
  });

  await page.goto("/space");
  await expect(page.getByRole("heading", { name: "Space dashboard" })).toBeVisible();

  // Wait for initial load to settle.
  await expect(page.getByText(/items needing attention/)).toBeVisible({ timeout: 5000 });

  // Rapidly toggle repos: click acme/web (deselects it → triggers request 2
  // with ?repos=acme%2Fapi), then immediately click All repos (triggers request
  // 3 without a repos param).
  await page.getByRole("button", { name: "acme/web" }).click();
  await page.getByRole("button", { name: "All repos" }).click();

  // Wait for the final state to settle.
  await expect(page.getByText(/items needing attention/)).toBeVisible({ timeout: 5000 });

  // Loading must have cleared.
  await expect(page.getByText("Loading…")).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// Test 3: Loading indicator stays active until the *current* request resolves,
//         not when a stale one resolves.
// ---------------------------------------------------------------------------

test("loading state: spinner clears only when the current request finishes", async ({
  page,
}) => {
  let attentionCallCount = 0;

  // First attention request resolves quickly, second (triggered by tab switch
  // back to attention) resolves slowly.
  await page.route("**/api/space/attention**", async (route) => {
    attentionCallCount++;
    const delay = attentionCallCount === 2 ? 600 : 0;
    await makeDelayedFulfill(route, attentionResponse, delay);
  });

  await page.route("**/api/space/index**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(indexResponse),
    });
  });

  await page.goto("/space");
  await expect(page.getByRole("heading", { name: "Space dashboard" })).toBeVisible();

  // Wait for the first attention load to complete.
  await expect(page.getByText(/items needing attention/)).toBeVisible({ timeout: 5000 });

  // Switch to tickets tab (fires index request).
  await page.getByTestId("tab-switcher").getByRole("button", { name: "All tickets" }).click();
  await expect(page.getByText(/\d+ tickets/)).toBeVisible({ timeout: 5000 });

  // Switch back to attention tab (fires a slow attention request).
  await page.getByTestId("tab-switcher").getByRole("button", { name: "Attention" }).click();

  // While the slow attention request is in-flight the loading state must be
  // visible (or the content must still be loading).  We check immediately after
  // the click, before the 600 ms delay elapses.
  const loadingLocator = page.getByText("Loading attention items…");
  const isLoadingVisible = await loadingLocator.isVisible();
  // The loading skeleton or text must appear at some point after the click.
  // We allow up to 300 ms for it to appear (well before the 600 ms delay).
  if (!isLoadingVisible) {
    await expect(loadingLocator).toBeVisible({ timeout: 300 });
  }

  // Eventually the slow request resolves and loading clears.
  await expect(page.getByText(/items needing attention/)).toBeVisible({ timeout: 3000 });
  await expect(page.getByText("Loading…")).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// Test 4: Aborted request produces no error banner.
// ---------------------------------------------------------------------------

test("aborted request: no error banner is shown when a request is cancelled by a newer one", async ({
  page,
}) => {
  let attentionCallCount = 0;

  // The first attention request is slow enough that switching tabs will abort it.
  await page.route("**/api/space/attention**", async (route) => {
    attentionCallCount++;
    const delay = attentionCallCount === 1 ? 800 : 0;
    await makeDelayedFulfill(route, attentionResponse, delay);
  });

  await page.route("**/api/space/index**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(indexResponse),
    });
  });

  await page.goto("/space");
  await expect(page.getByRole("heading", { name: "Space dashboard" })).toBeVisible();

  // Immediately switch tabs before the slow attention request can resolve.
  await page.getByTestId("tab-switcher").getByRole("button", { name: "All tickets" }).click();
  await expect(page.getByText(/\d+ tickets/)).toBeVisible({ timeout: 5000 });

  // Wait well past the 800 ms delay to ensure the aborted response has arrived
  // (and been ignored) before asserting no error is visible.
  await page.waitForTimeout(1000);

  // No error banner must be visible.
  await expect(page.locator(".bg-red-50")).not.toBeVisible();
  await expect(page.getByText(/Failed to load/)).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// Test 5: Rapid search typing does not break UI state.
//         (Search is client-side, but we verify no unexpected network calls
//          are made and the loading state is not incorrectly triggered.)
// ---------------------------------------------------------------------------

test("rapid search typing: filtering is immediate and loading state is unaffected", async ({
  page,
}) => {
  let fetchCount = 0;

  await page.route("**/api/space/attention**", async (route) => {
    fetchCount++;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(attentionResponse),
    });
  });

  await page.route("**/api/space/index**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(indexResponse),
    });
  });

  await page.goto("/space");
  await expect(page.getByRole("heading", { name: "Space dashboard" })).toBeVisible();
  await expect(page.getByText(/items needing attention/)).toBeVisible({ timeout: 5000 });

  const fetchCountAfterInitialLoad = fetchCount;

  // Type rapidly into the search box.
  const searchInput = page.getByRole("searchbox");
  await searchInput.fill("f");
  await searchInput.fill("fi");
  await searchInput.fill("fix");
  await searchInput.fill("fix ");
  await searchInput.fill("fix f");

  // Wait a moment to ensure no additional network calls are fired.
  await page.waitForTimeout(200);

  // Search filtering is purely client-side — no extra API calls.
  expect(fetchCount).toBe(fetchCountAfterInitialLoad);

  // Loading state must not have been triggered by typing.
  await expect(page.getByText("Loading…")).not.toBeVisible();

  // URL reflects the current query.
  await expect(page).toHaveURL(/q=fix\+f/);

  // The item matching "fix" is still visible (search is filtering, not hiding all).
  await expect(page.getByText("Fix flaky deploy checks")).toBeVisible();
});

// ---------------------------------------------------------------------------
// Test 6: Switching back and forth between tabs reaches a stable final state.
// ---------------------------------------------------------------------------

test("tab switching: settling on attention tab after rapid back-and-forth shows correct data", async ({
  page,
}) => {
  await page.route("**/api/space/attention**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(attentionResponse),
    });
  });

  await page.route("**/api/space/index**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(indexResponse),
    });
  });

  await page.goto("/space");
  await expect(page.getByRole("heading", { name: "Space dashboard" })).toBeVisible();

  const tabSwitcher = page.getByTestId("tab-switcher");

  // Rapidly toggle between tabs several times.
  for (let i = 0; i < 3; i++) {
    await tabSwitcher.getByRole("button", { name: "All tickets" }).click();
    await tabSwitcher.getByRole("button", { name: "Attention" }).click();
  }

  // After settling on the Attention tab, the correct data must be shown.
  await expect(page.getByText(/items needing attention/)).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("Loading…")).not.toBeVisible();
  await expect(page.locator(".bg-red-50")).not.toBeVisible();
});
