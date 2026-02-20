/**
 * POST /api/repos/:owner/:repo/tickets/:ticketId/changes
 *
 * Creates a ticket-change PR that modifies the ticket's frontmatter and index.json.
 */

import { NextRequest } from "next/server";
import {
  TicketError,
  type ApiErrorCode,
  type TicketChangePatch,
} from "@ticketdotapp/core";
import { apiError, apiSuccess } from "@/lib/api/response";
import { isAuthFailureResponse } from "@/lib/auth";
import { createOctokit } from "@/lib/github/client";
import { createTicketChangePr } from "@/lib/github/create-ticket-change-pr";
import { applyMutationGuards } from "@/lib/security/mutation-guard";
import { requireRepoAccess } from "@/lib/security/repo-access";

interface RouteParams {
  params: Promise<{ owner: string; repo: string; ticketId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { owner, repo, ticketId } = await params;
    const { session, fullName } = await requireRepoAccess(owner, repo);
    const guard = applyMutationGuards({
      request: req,
      bucket: "ticket-change-pr",
      identity: `${session.userId}:${fullName}`,
      limit: 20,
      windowMs: 60_000,
    });
    if (guard) {
      return guard;
    }

    const octokit = createOctokit(session.token);

    // Parse request body
    const body = await req.json();
    const patch: TicketChangePatch = body?.changes ?? {};
    const autoMerge: boolean = body?.autoMerge ?? true;

    // Validate we have something to do
    if (Object.keys(patch).length === 0) {
      return apiError("No changes provided", { status: 400 });
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

    return apiSuccess(result, { status: 201, legacyTopLevel: false });
  } catch (e: unknown) {
    if (isAuthFailureResponse(e)) {
      return e;
    }

    // Handle TicketError with structured code
    if (e instanceof TicketError) {
      return apiError(e.message, {
        status: 400,
        code: e.code as ApiErrorCode,
        details: e.details,
      });
    }

    // Handle GitHub API errors
    const error = e as { status?: number; message?: string };
    const isGitHubError = typeof error.status === "number";

    return apiError(error?.message ?? "Unknown error", {
      status: isGitHubError ? error.status : 500,
      code: isGitHubError ? "github_permission_denied" : "unknown",
    });
  }
}
