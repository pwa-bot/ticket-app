/**
 * POST /api/repos/:owner/:repo/tickets/:ticketId/changes
 *
 * Creates a ticket-change PR that modifies the ticket's frontmatter and index.json.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  TicketError,
  type ApiEnvelope,
  type ApiErrorCode,
  type CreateChangePrResponse,
  type TicketChangePatch,
} from "@ticketdotapp/core";
import { isUnauthorizedResponse, requireSession } from "@/lib/auth";
import { createOctokit } from "@/lib/github/client";
import { createTicketChangePr } from "@/lib/github/create-ticket-change-pr";

interface RouteParams {
  params: Promise<{ owner: string; repo: string; ticketId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await requireSession();
    const { owner, repo, ticketId } = await params;

    const octokit = createOctokit(token);

    // Parse request body
    const body = await req.json();
    const patch: TicketChangePatch = body?.changes ?? {};
    const autoMerge: boolean = body?.autoMerge ?? true;

    // Validate we have something to do
    if (Object.keys(patch).length === 0) {
      const resp: ApiEnvelope<CreateChangePrResponse> = {
        ok: false,
        error: {
          code: "unknown",
          message: "No changes provided",
        },
      };
      return NextResponse.json(resp, { status: 400 });
    }

    // Create the PR
    const result = await createTicketChangePr({
      octokit,
      owner,
      repo,
      ticketId,
      patch,
      autoMerge,
    });

    const resp: ApiEnvelope<CreateChangePrResponse> = {
      ok: true,
      data: result,
    };

    return NextResponse.json(resp, { status: 201 });
  } catch (e: unknown) {
    if (isUnauthorizedResponse(e)) {
      return e;
    }

    // Handle TicketError with structured code
    if (e instanceof TicketError) {
      const resp: ApiEnvelope<CreateChangePrResponse> = {
        ok: false,
        error: {
          code: e.code as ApiErrorCode,
          message: e.message,
          details: e.details,
        },
      };
      return NextResponse.json(resp, { status: 400 });
    }

    // Handle GitHub API errors
    const error = e as { status?: number; message?: string };
    const isGitHubError = typeof error.status === "number";

    const resp: ApiEnvelope<CreateChangePrResponse> = {
      ok: false,
      error: {
        code: isGitHubError ? "github_permission_denied" : "unknown",
        message: error?.message ?? "Unknown error",
      },
    };

    return NextResponse.json(resp, { status: isGitHubError ? error.status : 500 });
  }
}
