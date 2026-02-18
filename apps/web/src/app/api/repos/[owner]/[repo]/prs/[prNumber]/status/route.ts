/**
 * GET /api/repos/:owner/:repo/prs/:prNumber/status
 * 
 * Fetches PR status for pending change polling.
 * 
 * Response:
 * {
 *   "ok": true,
 *   "data": {
 *     "pr_url": "...",
 *     "pr_number": 123,
 *     "merged": false,
 *     "mergeable": true,
 *     "mergeable_state": "clean",
 *     "checks": { "state": "pass" },
 *     "reviews": { "required": false }
 *   }
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import type { ApiEnvelope, ApiErrorCode, PrStatusResponse } from "@ticketdotapp/core";

// TODO: Import from server lib once implemented
// import { getPrStatus } from "@/lib/github/getPrStatus";
// import { getGithubTokenFromSession } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ owner: string; repo: string; prNumber: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { owner, repo, prNumber } = await params;
    const prNum = Number(prNumber);

    if (Number.isNaN(prNum) || prNum <= 0) {
      return NextResponse.json({
        ok: false,
        error: { code: "invalid_pr_number", message: "PR number must be a positive integer" },
      }, { status: 400 });
    }

    // TODO: Get GitHub token from session
    // const token = await getGithubTokenFromSession(_req);
    // if (!token) {
    //   return NextResponse.json({
    //     ok: false,
    //     error: { code: "github_permission_denied", message: "Not authenticated" }
    //   }, { status: 401 });
    // }

    // TODO: Implement getPrStatus
    // const data = await getPrStatus({
    //   owner,
    //   repo,
    //   prNumber: prNum,
    //   token,
    // });

    // Stub response for now
    const stubData: PrStatusResponse = {
      pr_url: `https://github.com/${owner}/${repo}/pull/${prNum}`,
      pr_number: prNum,
      merged: false,
      mergeable: null,
      mergeable_state: null,
      checks: { state: "unknown" },
      reviews: { required: false },
    };

    const resp: ApiEnvelope<PrStatusResponse> = {
      ok: true,
      data: stubData,
      warnings: ["This endpoint is not yet implemented - stub response returned"],
    };

    return NextResponse.json(resp);
  } catch (e: unknown) {
    const error = e as { code?: ApiErrorCode; message?: string; details?: Record<string, unknown> };
    const resp: ApiEnvelope<PrStatusResponse> = {
      ok: false,
      error: {
        code: error?.code ?? "unknown",
        message: error?.message ?? "Unknown error",
        details: error?.details ?? {},
      },
    };
    return NextResponse.json(resp, { status: 400 });
  }
}
