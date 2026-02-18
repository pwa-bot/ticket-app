/**
 * POST /api/repos/:owner/:repo/tickets/:ticketId/changes
 * 
 * Creates a ticket-change PR that modifies the ticket's frontmatter and index.json.
 * 
 * Body:
 * {
 *   "changes": {
 *     "state": "in_progress",
 *     "priority": "p1",
 *     "labels_add": ["needs-input"],
 *     "labels_remove": ["wip"],
 *     "assignee": "agent:openclaw",
 *     "reviewer": "human:morgan"
 *   },
 *   "mode": "single"
 * }
 * 
 * Response:
 * {
 *   "ok": true,
 *   "data": {
 *     "pr_url": "...",
 *     "pr_number": 123,
 *     "branch": "ticket-change/01arz3nd/...",
 *     "status": "pending_checks"
 *   }
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import type { ApiEnvelope, ApiErrorCode, CreateChangePrResponse, TicketChangePatch } from "@ticketdotapp/core";

// TODO: Import from server lib once implemented
// import { createTicketChangePr } from "@/lib/github/createTicketChangePr";
// import { getGithubTokenFromSession } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ owner: string; repo: string; ticketId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { owner, repo, ticketId } = await params;
    const body = await req.json();
    const patch: TicketChangePatch = body?.changes ?? {};
    const _mode: "single" | "batch" = body?.mode ?? "single";

    // TODO: Get GitHub token from session
    // const token = await getGithubTokenFromSession(req);
    // if (!token) {
    //   return NextResponse.json({
    //     ok: false,
    //     error: { code: "github_permission_denied", message: "Not authenticated" }
    //   }, { status: 401 });
    // }

    // TODO: Implement createTicketChangePr
    // const result = await createTicketChangePr({
    //   owner,
    //   repo,
    //   ticketId,
    //   patch,
    //   mode,
    //   token,
    // });

    // Stub response for now
    const stubResult: CreateChangePrResponse = {
      pr_url: `https://github.com/${owner}/${repo}/pull/0`,
      pr_number: 0,
      branch: `ticket-change/${ticketId.slice(0, 8).toLowerCase()}/${Date.now()}`,
      status: "pending_checks",
    };

    const resp: ApiEnvelope<CreateChangePrResponse> = {
      ok: true,
      data: stubResult,
      warnings: ["This endpoint is not yet implemented - stub response returned"],
    };

    return NextResponse.json(resp);
  } catch (e: unknown) {
    const error = e as { code?: ApiErrorCode; message?: string; details?: Record<string, unknown> };
    const resp: ApiEnvelope<CreateChangePrResponse> = {
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
