import { NextRequest, NextResponse } from "next/server";
import { isUnauthorizedResponse, requireSession } from "@/lib/auth";
import { syncRepo, getRepo, reconcilePendingChanges } from "@/db/sync";

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
    const { token } = await requireSession();

    const { owner, repo } = await params;
    const fullName = `${owner}/${repo}`;

    // Parse body for force option
    let force = false;
    try {
      const body = await req.json();
      force = body?.force === true;
    } catch {
      // No body or invalid JSON is fine
    }

    // Run sync
    const result = await syncRepo(fullName, token, force);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, errorCode: result.errorCode },
        { status: 500 }
      );
    }

    // Also reconcile pending changes
    await reconcilePendingChanges(fullName, token);

    return NextResponse.json({
      success: true,
      changed: result.changed,
      ticketCount: result.ticketCount,
      indexSha: result.indexSha,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (isUnauthorizedResponse(error)) {
      return error;
    }
    console.error("[sync] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
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
    const fullName = `${owner}/${repo}`;

    const repoRow = await getRepo(fullName);

    if (!repoRow) {
      return NextResponse.json({
        synced: false,
        message: "Repo not synced yet",
      });
    }

    return NextResponse.json({
      synced: true,
      syncStatus: repoRow.syncStatus,
      lastSyncedAt: repoRow.lastSyncedAt?.toISOString(),
      lastIndexSha: repoRow.lastIndexSha,
      syncError: repoRow.syncError,
    });
  } catch (error) {
    console.error("[sync] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
