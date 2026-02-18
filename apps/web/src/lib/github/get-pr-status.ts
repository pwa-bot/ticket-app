import { Octokit } from "octokit";
import type { PrStatusResponse, CiStatusSummary } from "@ticketdotapp/core";

export type GetPrStatusArgs = {
  octokit: Octokit;
  owner: string;
  repo: string;
  prNumber: number;
};

/**
 * Fetches PR status for polling pending changes
 */
export async function getPrStatus(args: GetPrStatusArgs): Promise<PrStatusResponse> {
  const { octokit, owner, repo, prNumber } = args;

  // Get PR details
  const pr = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  // Get combined status for the head SHA
  let checksState: CiStatusSummary = "unknown";
  try {
    const status = await octokit.rest.repos.getCombinedStatusForRef({
      owner,
      repo,
      ref: pr.data.head.sha,
    });

    checksState = mapCombinedState(status.data.state);
  } catch {
    // Status might not exist yet
    checksState = "unknown";
  }

  // Check review requirements
  let reviewRequired = false;
  let requiredReviewers: string[] = [];
  let approvalsCount = 0;

  try {
    const reviews = await octokit.rest.pulls.listReviews({
      owner,
      repo,
      pull_number: prNumber,
    });

    // Count approvals
    approvalsCount = reviews.data.filter((r) => r.state === "APPROVED").length;

    // Check if branch protection requires reviews
    try {
      const protection = await octokit.rest.repos.getBranchProtection({
        owner,
        repo,
        branch: pr.data.base.ref,
      });

      const requiredReviews = protection.data.required_pull_request_reviews;
      if (requiredReviews) {
        reviewRequired = true;
        const requiredCount = requiredReviews.required_approving_review_count ?? 1;
        if (approvalsCount < requiredCount) {
          // Still needs reviews
          requiredReviewers = [`${requiredCount - approvalsCount} more approval(s) needed`];
        }
      }
    } catch {
      // Branch protection might not be set or accessible
    }
  } catch {
    // Reviews endpoint might fail
  }

  return {
    pr_url: pr.data.html_url,
    pr_number: prNumber,
    merged: pr.data.merged,
    mergeable: pr.data.mergeable,
    mergeable_state: pr.data.mergeable_state,
    checks: {
      state: checksState,
    },
    reviews: {
      required: reviewRequired,
      required_reviewers: requiredReviewers.length > 0 ? requiredReviewers : undefined,
      approvals_count: approvalsCount,
    },
  };
}

function mapCombinedState(state: string): CiStatusSummary {
  switch (state) {
    case "success":
      return "pass";
    case "failure":
    case "error":
      return "fail";
    case "pending":
      return "running";
    default:
      return "unknown";
  }
}
