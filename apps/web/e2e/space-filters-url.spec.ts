import { expect, test } from "@playwright/test";

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
      reasons: ["ci_failing", "pr_waiting_review"],
      reasonDetails: [
        {
          code: "ci_failing",
          label: "CI failing",
          description: "At least one linked open PR has failing checks.",
          rank: 1,
        },
        {
          code: "pr_waiting_review",
          label: "Open PR",
          description: "Ticket has an open linked PR that likely needs reviewer attention.",
          rank: 3,
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
      code: "blocked",
      label: "Blocked",
      description: "Ticket state is blocked and needs unblocking work.",
      rank: 0,
    },
    {
      code: "ci_failing",
      label: "CI failing",
      description: "At least one linked open PR has failing checks.",
      rank: 1,
    },
    {
      code: "stale_in_progress",
      label: "Stale (>24h)",
      description: "Ticket is in progress and cache data is older than 24 hours.",
      rank: 2,
    },
    {
      code: "pr_waiting_review",
      label: "Open PR",
      description: "Ticket has an open linked PR that likely needs reviewer attention.",
      rank: 3,
    },
    {
      code: "pending_pr",
      label: "Pending change",
      description: "A pending ticket-change PR exists and has not merged yet.",
      rank: 4,
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

test("space filters sync to URL and back/forward restores state", async ({ page }) => {
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

  await page.getByRole("button", { name: "acme/web" }).click();
  await expect(page).toHaveURL(/\/space\?repos=acme%2Fapi/);

  const search = page.getByRole("searchbox");
  await search.fill("failing");
  await expect(page).toHaveURL(/q=failing/);
  await expect(search).toHaveValue("failing");

  await page.getByRole("button", { name: "All Tickets" }).click();
  await expect(page).toHaveURL(/tab=tickets/);

  await page.goBack();
  await expect(page).not.toHaveURL(/tab=tickets/);
  await expect(search).toHaveValue("failing");

  await page.goBack();
  await expect(page).not.toHaveURL(/q=failing/);
  await expect(search).toHaveValue("");

  await page.goForward();
  await expect(page).toHaveURL(/q=failing/);
  await expect(search).toHaveValue("failing");

  await page.goForward();
  await expect(page).toHaveURL(/tab=tickets/);
});
