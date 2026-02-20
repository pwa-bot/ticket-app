/**
 * GET /api/repos/:owner/:repo/prs/:prNumber/status
 * PATCH /api/repos/:owner/:repo/prs/:prNumber/status — close the PR
 */

import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import type { ApiEnvelope, PrStatusResponse } from "@ticketdotapp/core";
import { db, schema } from "@/db/client";
import { isAuthFailureResponse } from "@/lib/auth";
import { createOctokit } from "@/lib/github/client";
import { applyMutationGuards } from "@/lib/security/mutation-guard";
import { requireRepoAccess } from "@/lib/security/repo-access";

interface RouteParams {
  params: Promise<{ owner: string; repo: string; prNumber: string }>;
}

function checksState(status: string): PrStatusResponse["checks"]["state"] {
  if (status === "pass") return "pass";
  if (status === "fail") return "fail";
  if (status === "running") return "running";
  return "unknown";
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { owner, repo, prNumber } = await params;
  const { fullName } = await requireRepoAccess(owner, repo);
  const prNum = Number(prNumber);

  if (Number.isNaN(prNum) || prNum <= 0) {
    const resp: ApiEnvelope<PrStatusResponse> = {
      ok: false,
      error: { code: "unknown", message: "PR number must be a positive integer" },
    };
    return NextResponse.json(resp, { status: 400 });
  }

  const row = await db.query.ticketPrs.findFirst({
    where: and(eq(schema.ticketPrs.repoFullName, fullName), eq(schema.ticketPrs.prNumber, prNum)),
  });

  if (!row) {
    const resp: ApiEnvelope<PrStatusResponse> = {
      ok: false,
      error: { code: "unknown", message: "PR status not found in cache" },
    };
    return NextResponse.json(resp, { status: 404 });
  }

  const data: PrStatusResponse = {
    pr_url: row.prUrl,
    pr_number: row.prNumber,
    merged: Boolean(row.merged),
    mergeable: row.mergeableState ? row.mergeableState === "clean" : null,
    mergeable_state: row.mergeableState ?? null,
    checks: { state: checksState(row.checksState) },
    reviews: {
      required: row.mergeableState === "blocked",
      approvals_count: row.mergeableState === "blocked" ? 0 : 1,
    },
  };

  return NextResponse.json({ ok: true, data } satisfies ApiEnvelope<PrStatusResponse>);
}

export async function PATCH(_req: NextRequest, { params }: RouteParams) {
  try {
    const { owner, repo, prNumber } = await params;
    const { session, fullName } = await requireRepoAccess(owner, repo);
    const guard = applyMutationGuards({
      request: _req,
      bucket: "pr-status-patch",
      identity: `${session.userId}:${fullName}`,
      limit: 20,
      windowMs: 60_000,
    });
    if (guard) {
      return guard;
    }

    const token = session.token;
    const prNum = Number(prNumber);

    if (Number.isNaN(prNum) || prNum <= 0) {
      const resp: ApiEnvelope<{ closed: boolean }> = {
        ok: false,
        error: { code: "unknown", message: "PR number must be a positive integer" },
      };
      return NextResponse.json(resp, { status: 400 });
    }

    const octokit = createOctokit(token);

    await octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: prNum,
      state: "closed",
    });

    await db
      .update(schema.ticketPrs)
      .set({ state: "closed", merged: false, updatedAt: new Date() })
      .where(and(eq(schema.ticketPrs.repoFullName, fullName), eq(schema.ticketPrs.prNumber, prNum)));

    return NextResponse.json({ ok: true, data: { closed: true } } satisfies ApiEnvelope<{ closed: boolean }>);
  } catch (e: unknown) {
    if (isAuthFailureResponse(e)) {
      return e;
    }
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: typeof err.status === "number" ? "github_permission_denied" : "unknown",
          message: err.message ?? "Unknown error",
        },
      } satisfies ApiEnvelope<{ closed: boolean }>,
      { status: typeof err.status === "number" ? err.status : 500 }
    );
  }
}
