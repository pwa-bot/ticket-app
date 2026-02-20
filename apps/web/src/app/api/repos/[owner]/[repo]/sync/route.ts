import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/response";
import { isAuthFailureResponse } from "@/lib/auth";
import { syncRepo, getRepo, reconcilePendingChanges } from "@/db/sync";
import { applyMutationGuards } from "@/lib/security/mutation-guard";
import { requireRepoAccess } from "@/lib/security/repo-access";

interface RouteParams {
  params: Promise<{ owner: string; repo: string }>;
}

/**
 * POST /api/repos/:owner/:repo/sync
 * 
 * Manually trigger a sync from GitHub.
 * Uses SHA-based incremental sync — only updates if index.json changed.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { owner, repo } = await params;
    const { session, fullName } = await requireRepoAccess(owner, repo);
    const guard = applyMutationGuards({
      request: req,
      bucket: "repo-sync",
      identity: `${session.userId}:${fullName}`,
      limit: 20,
      windowMs: 60_000,
    });
    if (guard) {
      return guard;
    }

    // Parse body for force option
    let force = false;
    try {
      const body = await req.json();
      force = body?.force === true;
    } catch {
      // No body or invalid JSON is fine
    }

    // Run sync
    const result = await syncRepo(fullName, session.token, force);

    if (!result.success) {
      return apiError(result.error ?? "Sync failed", {
        status: 500,
        legacy: { errorCode: result.errorCode },
      });
    }

    // Also reconcile pending changes
    await reconcilePendingChanges(fullName, session.token);

    return apiSuccess({
      success: true,
      changed: result.changed,
      ticketCount: result.ticketCount,
      indexSha: result.indexSha,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (isAuthFailureResponse(error)) {
      return error;
    }
    console.error("[sync] Error:", error);
    return apiError(error instanceof Error ? error.message : "Unknown error", { status: 500 });
  }
}

/**
 * GET /api/repos/:owner/:repo/sync
 * 
 * Get the sync status for a repo.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { owner, repo } = await params;
    const { fullName } = await requireRepoAccess(owner, repo);

    const repoRow = await getRepo(fullName);

    if (!repoRow) {
      return apiSuccess({
        synced: false,
        message: "Repo not synced yet",
      });
    }

    return apiSuccess({
      synced: true,
      syncStatus: repoRow.syncStatus,
      lastSyncedAt: repoRow.lastSyncedAt?.toISOString(),
      lastIndexSha: repoRow.lastIndexSha,
      syncError: repoRow.syncError,
    });
  } catch (error) {
    if (isAuthFailureResponse(error)) {
      return error;
    }
    console.error("[sync] Error:", error);
    return apiError(error instanceof Error ? error.message : "Unknown error", { status: 500 });
  }
}
