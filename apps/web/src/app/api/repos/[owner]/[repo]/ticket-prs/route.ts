/**
 * GET /api/repos/:owner/:repo/ticket-prs
 *
 * Returns open PRs with ticket-change/* branches, including their current status.
 * Used to restore pending change indicators across page refresh.
 */

import { NextResponse } from "next/server";
import type { ApiEnvelope, ApiErrorCode } from "@ticketdotapp/core";
import { getOctokitFromSession } from "@/lib/github/client";
import { getTicketPrs, type TicketPrInfo } from "@/lib/github/get-ticket-prs";

interface RouteParams {
  params: Promise<{ owner: string; repo: string }>;
}

type TicketPrsResponse = { prs: TicketPrInfo[] };

export async function GET(_req: Request, { params }: RouteParams) {
  const { owner, repo } = await params;

  const octokit = await getOctokitFromSession();
  if (!octokit) {
    const resp: ApiEnvelope<TicketPrsResponse> = {
      ok: false,
      error: {
        code: "github_permission_denied",
        message: "Not authenticated. Please log in with GitHub.",
      },
    };
    return NextResponse.json(resp, { status: 401 });
  }

  try {
    const prs = await getTicketPrs({ octokit, owner, repo });
    const resp: ApiEnvelope<TicketPrsResponse> = { ok: true, data: { prs } };
    return NextResponse.json(resp);
  } catch (e: unknown) {
    const error = e as { status?: number; message?: string; code?: ApiErrorCode };
    const isGitHubError = typeof error.status === "number";

    const resp: ApiEnvelope<TicketPrsResponse> = {
      ok: false,
      error: {
        code: error?.code ?? (isGitHubError ? "github_permission_denied" : "unknown"),
        message: error?.message ?? "Failed to fetch ticket PRs",
      },
    };
    return NextResponse.json(resp, { status: isGitHubError ? error.status : 500 });
  }
}
