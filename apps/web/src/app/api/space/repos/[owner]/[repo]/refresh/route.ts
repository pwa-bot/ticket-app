import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { apiError, apiSuccess } from "@/lib/api/response";
import { applyMutationGuards } from "@/lib/security/mutation-guard";
import { requireRepoAccess } from "@/lib/security/repo-access";
import { getManualRefreshJobService, RefreshQuotaExceededError } from "@/lib/services/manual-refresh-job-service";

interface Params {
  params: Promise<{ owner: string; repo: string }>;
}

/**
 * POST /api/space/repos/:owner/:repo/refresh
 * 
 * Triggers a background refresh job for the repo.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const { owner, repo: repoName } = await params;
  const { session, fullName } = await requireRepoAccess(owner, repoName);
  const guard = applyMutationGuards({
    request: _req,
    bucket: "space-refresh",
    identity: `${session.userId}:${fullName}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (guard) {
    return guard;
  }

  // Find the repo
  const repo = await db.query.repos.findFirst({
    where: eq(schema.repos.fullName, fullName),
  });

  if (!repo) {
    return apiError("Repo not found", { status: 404 });
  }

  const service = getManualRefreshJobService();
  let result;
  try {
    result = await service.enqueueRefresh({
      repoFullName: fullName,
      requestedByUserId: session.userId,
      force: true,
    });
  } catch (error) {
    if (error instanceof RefreshQuotaExceededError) {
      return apiError(error.message, {
        status: 429,
        headers: {
          "Retry-After": String(error.retryAfterSeconds),
        },
        details: {
          scope: error.scope,
          limit: error.limit,
          windowMs: error.windowMs,
          retryAfterSeconds: error.retryAfterSeconds,
        },
      });
    }
    throw error;
  }

  return apiSuccess(
    {
      queued: result.enqueued,
      job: {
        id: result.job.id,
        status: result.job.status,
        attempts: result.job.attempts,
        maxAttempts: result.job.maxAttempts,
        createdAt: result.job.createdAt.toISOString(),
      },
      repo: {
        id: repo.id,
        fullName,
      },
    },
    { status: 202 },
  );
}
