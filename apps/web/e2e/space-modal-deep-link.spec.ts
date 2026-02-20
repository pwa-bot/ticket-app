import { expect, test } from "@playwright/test";

const targetTicketId = "01KTEST0000000000000000099";

const attentionResponse = {
  items: [
    {
      repoFullName: "acme/api",
      ticketId: targetTicketId,
      shortId: "01KTEST9",
      displayId: "TK-01KTEST9",
      title: "Hidden by repo filter but deep-linkable",
      state: "blocked",
      priority: "p0",
      labels: ["blocked"],
      path: `.tickets/tickets/${targetTicketId}.md`,
      assignee: "human:alex",
      reviewer: "human:lee",
      createdAt: "2026-02-18T12:00:00.000Z",
      cachedAt: "2026-02-20T08:00:00.000Z",
      reasons: ["blocked"],
      reasonDetails: [
        {
          code: "blocked",
          label: "Blocked",
          description: "Ticket state is blocked and needs unblocking work.",
          rank: 0,
        },
      ],
      primaryReason: "blocked",
      prs: [],
      mergeReadiness: "UNKNOWN",
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
    reposSelected: 1,
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
  ],
  loadedAt: "2026-02-20T08:00:00.000Z",
};

const ticketDetailResponse = {
  id: targetTicketId,
  display_id: "TK-01KTEST9",
  repo: "acme/api",
  path: `.tickets/tickets/${targetTicketId}.md`,
  html_url: null,
  frontmatter: {
    id: targetTicketId,
    title: "Deep link ticket detail works outside current repo filter",
    state: "blocked",
    priority: "p0",
    labels: ["blocked"],
  },
  body: "This is a deep-linked ticket.",
  linked_prs: [],
};

test("deep-link modal opens ticket outside current repo filter", async ({ page }) => {
  await page.route("**/api/space/attention**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(attentionResponse),
    });
  });

  await page.route(`**/api/ticket/${targetTicketId}**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(ticketDetailResponse),
    });
  });

  await page.goto(`/space?repos=acme%2Fweb&ticket=${targetTicketId}&ticketRepo=acme%2Fapi`);

  await expect(page.getByRole("heading", { name: "Space dashboard" })).toBeVisible();
  await expect(page.getByText("No attention items match", { exact: false })).toBeVisible();

  await expect(page.getByRole("heading", { name: ticketDetailResponse.frontmatter.title })).toBeVisible();
  await expect(page.getByText("TK-01KTEST9")).toBeVisible();

  await page.getByTitle("Close (Esc)").click();
  await expect(page).toHaveURL(/\/space\?repos=acme%2Fweb$/);
  await expect(page.getByRole("heading", { name: ticketDetailResponse.frontmatter.title })).not.toBeVisible();
});
