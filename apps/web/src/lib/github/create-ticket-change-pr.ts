import { Octokit } from "octokit";
import {
  patchTicketFrontmatter,
  patchIndexJson,
  buildTicketChangeBranchName,
  buildPrTitle,
  buildPrBody,
  summarizePatch,
  TicketError,
  type TicketChangePatch,
  type CreateChangePrResponse,
} from "@ticketdotapp/core";

export type CreateTicketChangePrArgs = {
  octokit: Octokit;
  owner: string;
  repo: string;
  ticketId: string; // Full ULID, short id, or display id
  patch: TicketChangePatch;
  autoMerge?: boolean; // Whether to attempt auto-merge (default: true)
};

type ResolvedTicket = {
  fullUlid: string;
  shortId: string;
  displayId: string;
  currentState?: string;
};

/**
 * Creates a PR that modifies a ticket's frontmatter and index.json
 */
export async function createTicketChangePr(args: CreateTicketChangePrArgs): Promise<CreateChangePrResponse> {
  const { octokit, owner, repo, ticketId, patch, autoMerge = true } = args;

  // 1. Get default branch and base SHA
  const repoInfo = await octokit.rest.repos.get({ owner, repo });
  const defaultBranch = repoInfo.data.default_branch;

  const ref = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${defaultBranch}`,
  });
  const baseSha = ref.data.object.sha;

  // 2. Resolve ticket ID from index.json
  const resolved = await resolveTicketIdFromIndex({
    octokit,
    owner,
    repo,
    ref: defaultBranch,
    ticketId,
  });

  // 3. Create branch
  const branch = buildTicketChangeBranchName(resolved.shortId);
  await octokit.rest.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branch}`,
    sha: baseSha,
  });

  // 4. Fetch ticket file and index.json
  const ticketPath = `.tickets/tickets/${resolved.fullUlid}.md`;

  const [ticketFileResp, indexFileResp] = await Promise.all([
    octokit.rest.repos.getContent({
      owner,
      repo,
      path: ticketPath,
      ref: defaultBranch,
    }),
    octokit.rest.repos.getContent({
      owner,
      repo,
      path: ".tickets/index.json",
      ref: defaultBranch,
    }),
  ]);

  if (!("content" in ticketFileResp.data)) {
    throw new TicketError("ticket_not_found", `Ticket file not found: ${ticketPath}`, {});
  }
  if (!("content" in indexFileResp.data)) {
    throw new TicketError("index_missing_ticket_entry", "index.json not found", {});
  }

  const rawTicket = Buffer.from(ticketFileResp.data.content, "base64").toString("utf-8");
  const rawIndex = Buffer.from(indexFileResp.data.content, "base64").toString("utf-8");

  // 5. Apply patches
  const newRawTicket = patchTicketFrontmatter({
    ticketPath,
    rawTicket,
    patch,
  });

  const newRawIndex = patchIndexJson({
    rawIndex,
    ticketId: resolved.fullUlid,
    patch,
  });

  // 6. Create blobs
  const [ticketBlob, indexBlob] = await Promise.all([
    octokit.rest.git.createBlob({
      owner,
      repo,
      content: newRawTicket,
      encoding: "utf-8",
    }),
    octokit.rest.git.createBlob({
      owner,
      repo,
      content: newRawIndex,
      encoding: "utf-8",
    }),
  ]);

  // 7. Get base tree and create new tree
  const baseCommit = await octokit.rest.git.getCommit({
    owner,
    repo,
    commit_sha: baseSha,
  });
  const baseTreeSha = baseCommit.data.tree.sha;

  const tree = await octokit.rest.git.createTree({
    owner,
    repo,
    base_tree: baseTreeSha,
    tree: [
      {
        path: ticketPath,
        mode: "100644",
        type: "blob",
        sha: ticketBlob.data.sha,
      },
      {
        path: ".tickets/index.json",
        mode: "100644",
        type: "blob",
        sha: indexBlob.data.sha,
      },
    ],
  });

  // 8. Create commit
  const summary = summarizePatch(patch, resolved.currentState, patch.state);
  const commitMessage = `[${resolved.displayId}] ticket change: ${summary}`;

  const commit = await octokit.rest.git.createCommit({
    owner,
    repo,
    message: commitMessage,
    tree: tree.data.sha,
    parents: [baseSha],
  });

  // 9. Update branch ref
  await octokit.rest.git.updateRef({
    owner,
    repo,
    ref: `heads/${branch}`,
    sha: commit.data.sha,
    force: false,
  });

  // 10. Create PR
  const prTitle = buildPrTitle(resolved.displayId, summary);
  const prBodyText = buildPrBody({
    displayId: resolved.displayId,
    owner,
    repo,
    shortId: resolved.shortId,
    patch,
  });

  const pr = await octokit.rest.pulls.create({
    owner,
    repo,
    title: prTitle,
    head: branch,
    base: defaultBranch,
    body: prBodyText,
  });

  // 11. Attempt auto-merge via squash (if enabled)
  if (autoMerge) {
    try {
      await octokit.rest.pulls.merge({
        owner,
        repo,
        pull_number: pr.data.number,
        merge_method: "squash",
      });
      return {
        pr_url: pr.data.html_url,
        pr_number: pr.data.number,
        branch,
        status: "merged",
      };
    } catch {
      // Fall back if merge fails (required checks, reviews, conflicts, etc.)
    }
  } else {
    // Auto-merge disabled, return PR as mergeable (awaiting manual merge)
    return {
      pr_url: pr.data.html_url,
      pr_number: pr.data.number,
      branch,
      status: "mergeable",
    };
  }

  // Fall back if auto-merge was attempted but failed (required checks, reviews, conflicts, etc.)
  return {
    pr_url: pr.data.html_url,
    pr_number: pr.data.number,
    branch,
    status: "pending_checks",
  };
}

/**
 * Resolves a ticket ID (full ULID, short id, or display id) from index.json
 */
async function resolveTicketIdFromIndex(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  ref: string;
  ticketId: string;
}): Promise<ResolvedTicket> {
  const { octokit, owner, repo, ref, ticketId } = args;

  const indexResp = await octokit.rest.repos.getContent({
    owner,
    repo,
    path: ".tickets/index.json",
    ref,
  });

  if (!("content" in indexResp.data)) {
    throw new TicketError("index_missing_ticket_entry", "index.json not found or not a file", {});
  }

  const rawIndex = Buffer.from(indexResp.data.content, "base64").toString("utf-8");
  let idx: { tickets?: Array<{ id: string; short_id: string; display_id: string; state?: string }> };

  try {
    idx = JSON.parse(rawIndex);
  } catch {
    throw new TicketError("index_invalid_format", "index.json invalid JSON", {});
  }

  const tickets = Array.isArray(idx?.tickets) ? idx.tickets : [];
  if (!tickets.length) {
    throw new TicketError("ticket_not_found", "No tickets found in index.json", {});
  }

  // Normalize input for matching
  const wanted = normalizeWanted(ticketId);

  const matches = tickets.filter((t) => {
    const id = String(t.id ?? "").toUpperCase();
    const shortId = String(t.short_id ?? "").toUpperCase();
    const displayId = String(t.display_id ?? "").toUpperCase();
    return id === wanted || shortId === wanted || displayId === wanted;
  });

  if (matches.length === 0) {
    throw new TicketError("ticket_not_found", `Ticket not found: ${ticketId}`, {});
  }
  if (matches.length > 1) {
    throw new TicketError("ambiguous_id", `Ambiguous ticket id: ${ticketId}`, { count: matches.length });
  }

  const m = matches[0];
  return {
    fullUlid: String(m.id).toUpperCase(),
    shortId: String(m.short_id).toUpperCase(),
    displayId: String(m.display_id).toUpperCase(),
    currentState: m.state,
  };
}

function normalizeWanted(input: string): string {
  let v = input.trim().toUpperCase();
  // Strip TK- prefix if present for matching
  if (v.startsWith("TK-")) {
    v = v.slice(3);
  }
  return v;
}
