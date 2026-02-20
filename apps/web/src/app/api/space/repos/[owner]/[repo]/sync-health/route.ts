import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db, schema } from "@/db/client";
import { apiError, apiSuccess } from "@/lib/api/response";
import { requireRepoAccess } from "@/lib/security/repo-access";
import { computeSyncHealth } from "@/lib/sync-health";

interface Params {
  params: Promise<{ owner: string; repo: string }>;
}

/**
 * GET /api/space/repos/:owner/:repo/sync-health
 *
 * Returns sync observability details for one repo.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const nowMs = Date.now();
  const { owner, repo: repoName } = await params;
  const { fullName } = await requireRepoAccess(owner, repoName);

  const repo = await db.query.repos.findFirst({
    where: eq(schema.repos.fullName, fullName),
  });

  if (!repo) {
    return apiError("Repo not found", { status: 404 });
  }

  return apiSuccess({
    fullName,
    owner: repo.owner,
    repo: repo.repo,
    health: computeSyncHealth({
      syncStatus: repo.syncStatus,
      syncError: repo.syncError,
      lastSyncedAt: repo.lastSyncedAt,
    }, { nowMs }),
    loadedAt: new Date().toISOString(),
  });
}
