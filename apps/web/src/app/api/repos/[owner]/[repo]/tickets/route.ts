import { NextRequest, NextResponse } from "next/server";
import { getAccessTokenFromCookies } from "@/lib/auth";
import { getCachedTickets, getRepo, syncRepo, getPendingChanges } from "@/db/sync";

interface RouteParams {
  params: Promise<{ owner: string; repo: string }>;
}

// How long before we consider cache stale (5 minutes)
const CACHE_STALE_MS = 5 * 60 * 1000;

/**
 * GET /api/repos/:owner/:repo/tickets
 * 
 * Returns cached tickets from Postgres.
 * Triggers background sync if cache is stale.
 * Falls back to stale cache on errors.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const token = await getAccessTokenFromCookies();
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { owner, repo } = await params;
    const fullName = `${owner}/${repo}`;
    const forceRefresh = req.nextUrl.searchParams.get("refresh") === "true";

    // Get repo sync status
    const repoRow = await getRepo(fullName);
    const lastSyncTime = repoRow?.lastSyncedAt?.getTime() || 0;
    const isStale = (Date.now() - lastSyncTime) > CACHE_STALE_MS;
    const needsSync = forceRefresh || isStale || !repoRow?.lastIndexSha;

    // If we have fresh cached data, return it immediately
    if (repoRow?.lastIndexSha && !needsSync) {
      const [tickets, pending] = await Promise.all([
        getCachedTickets(fullName),
        getPendingChanges(fullName),
      ]);

      return NextResponse.json({
        tickets,
        pendingChanges: pending,
        source: "cache",
        lastSyncedAt: repoRow.lastSyncedAt?.toISOString(),
        lastIndexSha: repoRow.lastIndexSha,
        syncStatus: repoRow.syncStatus,
        ticketCount: tickets.length,
      });
    }

    // Need to sync
    const result = await syncRepo(fullName, token, forceRefresh);

    if (!result.success) {
      // Try to return stale cache on error
      const tickets = await getCachedTickets(fullName);
      if (tickets.length > 0) {
        const pending = await getPendingChanges(fullName);
        return NextResponse.json({
          tickets,
          pendingChanges: pending,
          source: "stale_cache",
          lastSyncedAt: repoRow?.lastSyncedAt?.toISOString(),
          syncStatus: "error",
          syncError: result.error,
          errorCode: result.errorCode,
          ticketCount: tickets.length,
          warning: `Using stale cache: ${result.error}`,
        });
      }
      return NextResponse.json(
        { error: result.error, errorCode: result.errorCode },
        { status: 500 }
      );
    }

    // Return freshly synced data
    const [tickets, pending] = await Promise.all([
      getCachedTickets(fullName),
      getPendingChanges(fullName),
    ]);
    const updatedRepo = await getRepo(fullName);

    return NextResponse.json({
      tickets,
      pendingChanges: pending,
      source: result.changed ? "github" : "cache",
      lastSyncedAt: updatedRepo?.lastSyncedAt?.toISOString(),
      lastIndexSha: result.indexSha,
      syncStatus: "idle",
      ticketCount: tickets.length,
      changed: result.changed,
    });
  } catch (error) {
    console.error("[tickets] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
