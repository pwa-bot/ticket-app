import { expect, test } from "@playwright/test";

const attentionResponse = {
  items: [],
  repos: [
    {
      fullName: "acme/api",
      owner: "acme",
      repo: "api",
      totalTickets: 3,
      attentionTickets: 0,
    },
  ],
  totals: {
    reposEnabled: 1,
    reposSelected: 1,
    ticketsTotal: 3,
    ticketsAttention: 0,
  },
  reasonCatalog: [],
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
      title: "Ship grouped table behavior",
      state: "in_progress",
      priority: "p0",
      labels: ["dashboard"],
      path: ".tickets/tickets/01KTEST0000000000000000001.md",
      assignee: "human:alex",
      reviewer: "human:lee",
      createdAt: "2026-02-18T12:00:00.000Z",
      cachedAt: "2026-02-20T08:00:00.000Z",
    },
    {
      repoFullName: "acme/api",
      repoOwner: "acme",
      repoName: "api",
      id: "01KTEST0000000000000000002",
      shortId: "01KTEST1",
      displayId: "TK-01KTEST1",
      title: "Prepare release notes",
      state: "ready",
      priority: "p1",
      labels: ["release"],
      path: ".tickets/tickets/01KTEST0000000000000000002.md",
      assignee: "human:alex",
      reviewer: "human:sam",
      createdAt: "2026-02-18T12:10:00.000Z",
      cachedAt: "2026-02-20T08:00:00.000Z",
    },
    {
      repoFullName: "acme/api",
      repoOwner: "acme",
      repoName: "api",
      id: "01KTEST0000000000000000003",
      shortId: "01KTEST2",
      displayId: "TK-01KTEST2",
      title: "Triage backlog follow-ups",
      state: "backlog",
      priority: "p2",
      labels: ["triage"],
      path: ".tickets/tickets/01KTEST0000000000000000003.md",
      assignee: "human:lee",
      reviewer: "human:sam",
      createdAt: "2026-02-18T12:20:00.000Z",
      cachedAt: "2026-02-20T08:00:00.000Z",
    },
  ],
  repos: [
    {
      fullName: "acme/api",
      owner: "acme",
      repo: "api",
      totalTickets: 3,
    },
  ],
  totals: {
    reposEnabled: 1,
    reposSelected: 1,
    ticketsTotal: 3,
  },
  loadedAt: "2026-02-20T08:00:00.000Z",
};

test("all tickets mode groups by state and supports search", async ({ page }) => {
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
  const tabSwitcher = page.getByTestId("tab-switcher");
  await expect(tabSwitcher.getByRole("button", { name: "All tickets" })).toBeVisible();

  await tabSwitcher.getByRole("button", { name: "All tickets" }).click();
  await expect(page).toHaveURL(/tab=tickets/);

  await expect(page.getByText(/In Progress\s*\(1\)/)).toBeVisible();
  await expect(page.getByText(/Ready\s*\(1\)/)).toBeVisible();
  await expect(page.getByText(/Backlog\s*\(1\)/)).toBeVisible();

  const search = page.getByRole("searchbox");
  await search.fill("release");
  await expect(page).toHaveURL(/q=release/);
  await expect(page.getByText("Prepare release notes")).toBeVisible();
  await expect(page.getByText("Ship grouped table behavior")).not.toBeVisible();
  await expect(page.getByText("Triage backlog follow-ups")).not.toBeVisible();
  await expect(page.getByText(/Ready\s*\(1\)/)).toBeVisible();
});
