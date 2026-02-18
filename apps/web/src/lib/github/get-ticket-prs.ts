import { Octokit } from "octokit";
import type { PendingChangeStatus, PrStatusResponse } from "@ticketdotapp/core";
import { getPrStatus } from "./get-pr-status";

export type TicketPrInfo = {
  ticketId: string; // full ULID
  prNumber: number;
  prUrl: string;
  prTitle: string;
  status: PendingChangeStatus;
};

type IndexEntry = {
  id: string;
  short_id?: string;
};

/**
 * Parse the short ticket ID from a ticket-change branch name.
 * Branch format: ticket-change/{shortId}/{timestamp}
 */
function parseShortIdFromBranch(branch: string): string | null {
  const parts = branch.split("/");
  if (parts[0] !== "ticket-change" || parts.length < 3) return null;
  return parts[1].toLowerCase();
}

/**
 * Fetches open PRs with ticket-change/* branches and returns their current status.
 * Used to restore pending change indicators across page refresh.
 */
export async function getTicketPrs(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
}): Promise<TicketPrInfo[]> {
  const { octokit, owner, repo } = args;

  // 1. Get open PRs
  const { data: pulls } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: "open",
    per_page: 100,
  });

  // 2. Filter to ticket-change branches
  const ticketPulls = pulls.filter((pr) => pr.head.ref.startsWith("ticket-change/"));
  if (ticketPulls.length === 0) return [];

  // 3. Fetch index.json to resolve shortId → fullId
  let indexEntries: IndexEntry[] = [];
  try {
    const { data: indexFile } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: ".tickets/index.json",
    });
    if ("content" in indexFile) {
      const raw = Buffer.from(indexFile.content, "base64").toString("utf-8");
      const parsed = JSON.parse(raw) as { tickets?: IndexEntry[] };
      indexEntries = parsed.tickets ?? [];
    }
  } catch {
    return [];
  }

  // Build shortId -> fullId map
  const shortIdMap = new Map<string, string>();
  for (const entry of indexEntries) {
    const shortId = (entry.short_id ?? entry.id.slice(0, 8)).toLowerCase();
    shortIdMap.set(shortId, entry.id);
  }

  // 4. Fetch status for each ticket PR in parallel and resolve ticket ID
  const results: TicketPrInfo[] = [];
  await Promise.all(
    ticketPulls.map(async (pr) => {
      const shortId = parseShortIdFromBranch(pr.head.ref);
      if (!shortId) return;

      const fullId = shortIdMap.get(shortId);
      if (!fullId) return;

      try {
        const prStatus = await getPrStatus({ octokit, owner, repo, prNumber: pr.number });
        results.push({
          ticketId: fullId,
          prNumber: pr.number,
          prUrl: pr.html_url,
          prTitle: pr.title,
          status: mapPrStatusToChangeStatus(prStatus),
        });
      } catch {
        // Skip PRs where status fetch fails
      }
    }),
  );

  return results;
}

function mapPrStatusToChangeStatus(pr: PrStatusResponse): PendingChangeStatus {
  if (pr.merged) return "merged";
  if (pr.mergeable === false) return "conflict";
  if (pr.checks.state === "fail") return "pending_checks";
  if (pr.reviews.required && (pr.reviews.approvals_count ?? 0) < 1) return "waiting_review";
  if (pr.mergeable === true && pr.checks.state === "pass") return "mergeable";
  return "pending_checks";
}
