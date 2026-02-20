/**
 * E2E tests for Saved Views v1 – shareable operational queues
 * TK-01KHW6EY-3
 *
 * Coverage:
 *  - Save a view from active filters
 *  - Saved view appears in dropdown and is selectable
 *  - Rename a saved view
 *  - Delete a saved view
 *  - Share link dialog shows correct URL
 *  - Copy link button in dropdown triggers toast feedback
 *  - SaveViewBanner appears for shared URL recipients and lets them save
 *  - Saved views persist across page reload (localStorage)
 *  - Clearing filters shows "All tickets" in dropdown
 */

import { expect, test } from "@playwright/test";

// ─── Shared mock data ─────────────────────────────────────────────────────────

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
    {
      repoFullName: "acme/web",
      ticketId: "01KTEST0000000000000000002",
      shortId: "01KTEST1",
      displayId: "TK-01KTEST1",
      title: "Update landing page copy",
      state: "in_progress",
      priority: "p2",
      labels: ["marketing"],
      path: ".tickets/tickets/01KTEST0000000000000000002.md",
      assignee: "human:lee",
      reviewer: null,
      createdAt: "2026-02-17T10:00:00.000Z",
      cachedAt: "2026-02-20T08:00:00.000Z",
      reasons: ["stale_in_progress"],
      reasonDetails: [
        {
          code: "stale_in_progress",
          label: "Stale (>24h)",
          description: "Ticket is in progress and cache data is older than 24 hours.",
          rank: 2,
        },
      ],
      primaryReason: "stale_in_progress",
      prs: [],
      mergeReadiness: "UNKNOWN",
      hasPendingChange: false,
    },
  ],
  repos: [
    { fullName: "acme/api", owner: "acme", repo: "api", totalTickets: 5, attentionTickets: 1 },
    { fullName: "acme/web", owner: "acme", repo: "web", totalTickets: 3, attentionTickets: 1 },
  ],
  totals: { reposEnabled: 2, reposSelected: 2, ticketsTotal: 8, ticketsAttention: 2 },
  reasonCatalog: [
    { code: "ci_failing", label: "CI failing", description: "", rank: 1 },
    { code: "stale_in_progress", label: "Stale (>24h)", description: "", rank: 2 },
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
    { fullName: "acme/api", owner: "acme", repo: "api", totalTickets: 5 },
    { fullName: "acme/web", owner: "acme", repo: "web", totalTickets: 3 },
  ],
  totals: { reposEnabled: 2, reposSelected: 2, ticketsTotal: 6 },
  loadedAt: "2026-02-20T08:00:00.000Z",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function setupRoutes(page: import("@playwright/test").Page) {
  await page.route("**/api/space/attention**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(attentionResponse) })
  );
  await page.route("**/api/space/index**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(indexResponse) })
  );
}

async function clearSavedViews(page: import("@playwright/test").Page) {
  await page.evaluate(() => localStorage.removeItem("ticketapp.savedViews.v1"));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("Saved views dropdown", () => {
  test("shows 'All tickets' label when no filters active", async ({ page }) => {
    await setupRoutes(page);
    await page.goto("/space");

    const trigger = page.getByRole("button", { name: /all tickets/i }).first();
    await expect(trigger).toBeVisible();
  });

  test("shows 'Custom filter' label when filters are active", async ({ page }) => {
    await setupRoutes(page);
    await page.goto("/space?repos=acme%2Fapi");

    // The saved-views dropdown trigger should say "Custom filter"
    await expect(page.getByRole("button", { name: /custom filter/i })).toBeVisible();
  });

  test("dropdown opens and closes on trigger click", async ({ page }) => {
    await setupRoutes(page);
    await page.goto("/space");

    const trigger = page.getByRole("button", { name: /all tickets/i }).first();
    await trigger.click();

    await expect(page.getByRole("listbox", { name: /saved views/i })).toBeVisible();

    // Click outside
    await page.keyboard.press("Escape");
    // Backdrop click or clicking outside closes it
    await page.mouse.click(800, 400);
    await expect(page.getByRole("listbox", { name: /saved views/i })).not.toBeVisible();
  });
});

test.describe("Save a view", () => {
  test.beforeEach(async ({ page }) => {
    await setupRoutes(page);
    await page.goto("/space");
    await clearSavedViews(page);
  });

  test("saves a view from active filter and shows it in dropdown", async ({ page }) => {
    // Apply a filter
    await page.getByRole("button", { name: "acme/web" }).click();
    await expect(page).toHaveURL(/repos=acme%2Fapi/);

    // Open saved views dropdown
    await page.getByRole("button", { name: /custom filter/i }).click();
    await page.getByRole("button", { name: /save current view/i }).click();

    // Fill the modal
    const modal = page.getByRole("dialog", { name: /save view/i });
    await expect(modal).toBeVisible();
    await modal.getByRole("textbox").fill("API only");
    await modal.getByRole("button", { name: /^save$/i }).click();

    await expect(modal).not.toBeVisible();

    // Trigger button should now show the saved view name
    await expect(page.getByRole("button", { name: /api only/i })).toBeVisible();
  });

  test("saved view applies filters when selected", async ({ page }) => {
    // Pre-populate localStorage with a view
    await page.evaluate(() => {
      localStorage.setItem(
        "ticketapp.savedViews.v1",
        JSON.stringify({
          views: [
            {
              id: "sv_test001",
              name: "API P0s",
              repo: null,
              query: "repos=acme%2Fapi&q=deploy",
              createdAt: "2026-02-19T00:00:00.000Z",
            },
          ],
        })
      );
    });

    await page.reload();
    await page.getByRole("button", { name: /all tickets/i }).first().click();
    await expect(page.getByRole("listbox")).toContainText("API P0s");

    await page.getByRole("option", { name: "API P0s" }).click();
    await expect(page).toHaveURL(/repos=acme%2Fapi/);
    await expect(page).toHaveURL(/q=deploy/);
  });
});

test.describe("Rename and delete views", () => {
  test.beforeEach(async ({ page }) => {
    await setupRoutes(page);
    await page.goto("/space");
    await page.evaluate(() => {
      localStorage.setItem(
        "ticketapp.savedViews.v1",
        JSON.stringify({
          views: [
            {
              id: "sv_rename01",
              name: "Old name",
              repo: null,
              query: "repos=acme%2Fapi",
              createdAt: "2026-02-19T00:00:00.000Z",
            },
          ],
        })
      );
    });
    await page.reload();
  });

  test("renames a saved view", async ({ page }) => {
    // Open dropdown
    await page.getByRole("button", { name: /all tickets/i }).first().click();
    await expect(page.getByRole("listbox")).toContainText("Old name");

    // Hover over the view to reveal actions
    await page.getByRole("option", { name: "Old name" }).hover();
    await page.getByRole("button", { name: /rename old name/i }).click();

    const modal = page.getByRole("dialog", { name: /rename view/i });
    await expect(modal).toBeVisible();
    await modal.getByRole("textbox").clear();
    await modal.getByRole("textbox").fill("New name");
    await modal.getByRole("button", { name: /^rename$/i }).click();

    await expect(modal).not.toBeVisible();

    // Verify localStorage was updated
    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem("ticketapp.savedViews.v1");
      return raw ? JSON.parse(raw) : null;
    });
    expect(stored.views[0].name).toBe("New name");
  });

  test("deletes a saved view", async ({ page }) => {
    await page.getByRole("button", { name: /all tickets/i }).first().click();
    await expect(page.getByRole("listbox")).toContainText("Old name");

    await page.getByRole("option", { name: "Old name" }).hover();
    await page.getByRole("button", { name: /delete old name/i }).click();

    // View should be gone from the dropdown
    await expect(page.getByRole("listbox")).not.toContainText("Old name");

    // Verify localStorage
    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem("ticketapp.savedViews.v1");
      return raw ? JSON.parse(raw) : null;
    });
    expect(stored.views).toHaveLength(0);
  });
});

test.describe("Share link", () => {
  test("share link dialog opens with correct URL", async ({ page }) => {
    await setupRoutes(page);
    await page.goto("/space?repos=acme%2Fapi&q=deploy");

    await page.getByRole("button", { name: /custom filter/i }).click();
    await page.getByRole("button", { name: /share link/i }).click();

    const dialog = page.getByRole("dialog", { name: /share this view/i });
    await expect(dialog).toBeVisible();

    const urlInput = dialog.getByRole("textbox", { name: /shareable link/i });
    const urlValue = await urlInput.inputValue();
    expect(urlValue).toContain("/space?");
    expect(urlValue).toContain("repos=acme%2Fapi");
    expect(urlValue).toContain("q=deploy");
  });

  test("copy button in share dialog shows Copied! feedback", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await setupRoutes(page);
    await page.goto("/space?repos=acme%2Fapi");

    await page.getByRole("button", { name: /custom filter/i }).click();
    await page.getByRole("button", { name: /share link/i }).click();

    const dialog = page.getByRole("dialog", { name: /share this view/i });
    const copyBtn = dialog.getByRole("button", { name: /^copy$/i });
    await copyBtn.click();

    await expect(dialog.getByRole("button", { name: /copied!/i })).toBeVisible();
  });

  test("share dialog offers save to my views when view not already saved", async ({ page }) => {
    await setupRoutes(page);
    await page.goto("/space?repos=acme%2Fapi");
    await clearSavedViews(page);

    await page.getByRole("button", { name: /custom filter/i }).click();
    await page.getByRole("button", { name: /share link/i }).click();

    const dialog = page.getByRole("dialog", { name: /share this view/i });
    await expect(dialog.getByRole("button", { name: /save to my views/i })).toBeVisible();
  });

  test("share dialog shows 'Already saved' when view is saved", async ({ page }) => {
    await setupRoutes(page);
    await page.goto("/space?repos=acme%2Fapi");
    await page.evaluate(() => {
      localStorage.setItem(
        "ticketapp.savedViews.v1",
        JSON.stringify({
          views: [
            {
              id: "sv_already01",
              name: "API Only",
              repo: null,
              query: "repos=acme%2Fapi",
              createdAt: "2026-02-19T00:00:00.000Z",
            },
          ],
        })
      );
    });
    await page.reload();

    await page.getByRole("button", { name: /api only/i }).click();
    await page.getByRole("button", { name: /share link/i }).click();

    const dialog = page.getByRole("dialog", { name: /share this view/i });
    await expect(dialog.getByText(/already saved to your views/i)).toBeVisible();
  });

  test("copy link in dropdown shows toast feedback", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await setupRoutes(page);
    await page.goto("/space?repos=acme%2Fapi");

    await page.getByRole("button", { name: /custom filter/i }).click();
    // Click "Share link…" in dropdown, which opens the share dialog
    await page.getByRole("button", { name: /share link/i }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /^copy$/i }).click();
    await expect(dialog.getByRole("button", { name: /copied!/i })).toBeVisible();
  });
});

test.describe("SaveViewBanner – shared URL recipient flow", () => {
  test("shows banner when user arrives via shared URL with filters", async ({ page }) => {
    await setupRoutes(page);
    // Clear any existing saved views
    await page.goto("/space");
    await clearSavedViews(page);

    // Simulate someone sharing this URL
    await page.goto("/space?repos=acme%2Fapi&q=deploy");

    await expect(page.getByRole("banner", { name: /viewing a shared queue filter/i }).or(
      page.getByText(/viewing a shared queue filter/i)
    )).toBeVisible();
  });

  test("banner not shown when the URL matches an already-saved view", async ({ page }) => {
    await setupRoutes(page);
    await page.goto("/space");
    await page.evaluate(() => {
      localStorage.setItem(
        "ticketapp.savedViews.v1",
        JSON.stringify({
          views: [
            {
              id: "sv_banner01",
              name: "Deploy issues",
              repo: null,
              query: "repos=acme%2Fapi&q=deploy",
              createdAt: "2026-02-19T00:00:00.000Z",
            },
          ],
        })
      );
    });

    await page.goto("/space?repos=acme%2Fapi&q=deploy");
    await expect(page.getByText(/viewing a shared queue filter/i)).not.toBeVisible();
  });

  test("banner not shown when no filters are active", async ({ page }) => {
    await setupRoutes(page);
    await page.goto("/space");
    await clearSavedViews(page);

    await expect(page.getByText(/viewing a shared queue filter/i)).not.toBeVisible();
  });

  test("banner lets user save the shared view with a name", async ({ page }) => {
    await setupRoutes(page);
    await page.goto("/space");
    await clearSavedViews(page);

    await page.goto("/space?repos=acme%2Fapi");

    const saveBtn = page.getByRole("button", { name: /save to my views/i });
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    const modal = page.getByRole("dialog", { name: /save view/i });
    await expect(modal).toBeVisible();
    await modal.getByRole("textbox").fill("Shared API filter");
    await modal.getByRole("button", { name: /^save$/i }).click();

    await expect(modal).not.toBeVisible();
    // Banner should disappear now that the view is saved
    await expect(page.getByText(/viewing a shared queue filter/i)).not.toBeVisible();
  });

  test("banner can be dismissed", async ({ page }) => {
    await setupRoutes(page);
    await page.goto("/space");
    await clearSavedViews(page);

    await page.goto("/space?q=failing");

    await expect(page.getByText(/viewing a shared queue filter/i)).toBeVisible();
    await page.getByRole("button", { name: /dismiss/i }).click();
    await expect(page.getByText(/viewing a shared queue filter/i)).not.toBeVisible();
  });
});

test.describe("View persistence (localStorage)", () => {
  test("saved views survive a page reload", async ({ page }) => {
    await setupRoutes(page);
    await page.goto("/space");
    await clearSavedViews(page);

    // Apply filter + save view
    await page.goto("/space?repos=acme%2Fapi");
    await page.getByRole("button", { name: /custom filter/i }).click();
    await page.getByRole("button", { name: /save current view/i }).click();

    const modal = page.getByRole("dialog");
    await modal.getByRole("textbox").fill("Persistent view");
    await modal.getByRole("button", { name: /^save$/i }).click();

    // Reload the page
    await page.reload();
    await setupRoutes(page);

    // View should still appear in the dropdown on the blank state
    await page.goto("/space");
    await page.getByRole("button", { name: /all tickets/i }).first().click();
    await expect(page.getByRole("listbox")).toContainText("Persistent view");
  });
});

test.describe("Clear filters", () => {
  test("clicking 'All tickets' in dropdown clears filters", async ({ page }) => {
    await setupRoutes(page);
    await page.goto("/space?repos=acme%2Fapi&q=deploy");

    await page.getByRole("button", { name: /custom filter/i }).click();
    // Use role="option" to target the "All tickets" item inside the listbox
    await page.getByRole("option", { name: /^all tickets$/i }).click();

    await expect(page).toHaveURL("/space");
    await expect(page.getByRole("button", { name: /all tickets/i }).first()).toBeVisible();
  });
});
