/**
 * GET /api/repos/:owner/:repo/prs/:prNumber/status
 * PATCH /api/repos/:owner/:repo/prs/:prNumber/status — close the PR
 *
 * Fetches or updates PR status for pending change management.
 */

import { NextRequest, NextResponse } from "next/server";
import type { ApiEnvelope, ApiErrorCode, PrStatusResponse } from "@ticketdotapp/core";
import { getOctokitFromSession } from "@/lib/github/client";
import { getPrStatus } from "@/lib/github/get-pr-status";

interface RouteParams {
  params: Promise<{ owner: string; repo: string; prNumber: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { owner, repo, prNumber } = await params;
    const prNum = Number(prNumber);

    if (Number.isNaN(prNum) || prNum <= 0) {
      const resp: ApiEnvelope<PrStatusResponse> = {
        ok: false,
        error: {
          code: "unknown",
          message: "PR number must be a positive integer",
        },
      };
      return NextResponse.json(resp, { status: 400 });
    }

    // Get authenticated client
    const octokit = await getOctokitFromSession();
    if (!octokit) {
      const resp: ApiEnvelope<PrStatusResponse> = {
        ok: false,
        error: {
          code: "github_permission_denied",
          message: "Not authenticated. Please log in with GitHub.",
        },
      };
      return NextResponse.json(resp, { status: 401 });
    }

    const data = await getPrStatus({
      octokit,
      owner,
      repo,
      prNumber: prNum,
    });

    const resp: ApiEnvelope<PrStatusResponse> = {
      ok: true,
      data,
    };

    return NextResponse.json(resp);
  } catch (e: unknown) {
    const error = e as { status?: number; message?: string; code?: ApiErrorCode };
    const isGitHubError = typeof error.status === "number";

    const resp: ApiEnvelope<PrStatusResponse> = {
      ok: false,
      error: {
        code: error?.code ?? (isGitHubError ? "github_permission_denied" : "unknown"),
        message: error?.message ?? "Unknown error",
      },
    };

    return NextResponse.json(resp, { status: isGitHubError ? error.status : 500 });
  }
}

/**
 * PATCH - Close a PR (used for cancel/retry flows)
 */
export async function PATCH(_req: NextRequest, { params }: RouteParams) {
  try {
    const { owner, repo, prNumber } = await params;
    const prNum = Number(prNumber);

    if (Number.isNaN(prNum) || prNum <= 0) {
      const resp: ApiEnvelope<{ closed: boolean }> = {
        ok: false,
        error: {
          code: "unknown",
          message: "PR number must be a positive integer",
        },
      };
      return NextResponse.json(resp, { status: 400 });
    }

    const octokit = await getOctokitFromSession();
    if (!octokit) {
      const resp: ApiEnvelope<{ closed: boolean }> = {
        ok: false,
        error: {
          code: "github_permission_denied",
          message: "Not authenticated. Please log in with GitHub.",
        },
      };
      return NextResponse.json(resp, { status: 401 });
    }

    // Close the PR
    await octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: prNum,
      state: "closed",
    });

    const resp: ApiEnvelope<{ closed: boolean }> = {
      ok: true,
      data: { closed: true },
    };

    return NextResponse.json(resp);
  } catch (e: unknown) {
    const error = e as { status?: number; message?: string; code?: ApiErrorCode };
    const isGitHubError = typeof error.status === "number";

    const resp: ApiEnvelope<{ closed: boolean }> = {
      ok: false,
      error: {
        code: error?.code ?? (isGitHubError ? "github_permission_denied" : "unknown"),
        message: error?.message ?? "Unknown error",
      },
    };

    return NextResponse.json(resp, { status: isGitHubError ? error.status : 500 });
  }
}
