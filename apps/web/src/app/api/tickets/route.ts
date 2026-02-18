import { NextResponse } from "next/server";
import { getAccessTokenFromCookies } from "@/lib/auth";
import { getCachedTickets, getRepo, syncRepo, getPendingChanges } from "@/db/sync";

// How long before we consider cache stale (5 minutes)
const CACHE_STALE_MS = 5 * 60 * 1000;

export async function GET(request: Request) {
  const token = await getAccessTokenFromCookies();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const repo = url.searchParams.get("repo");
  const refresh = url.searchParams.get("refresh") === "1";
  
  if (!repo) {
    return NextResponse.json({ error: "Missing repo query parameter" }, { status: 400 });
  }

  try {
    // Check if we have cached data and if it's fresh
    const repoRow = await getRepo(repo);
    const lastSyncTime = repoRow?.lastSyncedAt?.getTime() || 0;
    const isStale = (Date.now() - lastSyncTime) > CACHE_STALE_MS;
    const needsSync = refresh || isStale || !repoRow?.lastIndexSha;

    // If we have fresh cached data, return it immediately
    if (repoRow?.lastIndexSha && !needsSync) {
      const tickets = await getCachedTickets(repo);
      
      return NextResponse.json({
        format_version: 1,
        tickets: tickets.map(t => ({
          id: t.id,
          short_id: t.shortId,
          display_id: t.displayId,
          title: t.title,
          state: t.state,
          priority: t.priority,
          labels: t.labels,
          assignee: t.assignee,
          reviewer: t.reviewer,
          path: t.path,
          created: t.createdAt?.toISOString(),
          updated: t.cachedAt?.toISOString(), // approx: last sync time
        })),
        // Freshness metadata
        _meta: {
          source: "cache",
          lastSyncedAt: repoRow.lastSyncedAt?.toISOString(),
          lastIndexSha: repoRow.lastIndexSha,
          syncStatus: repoRow.syncStatus,
        },
      });
    }

    // Need to sync from GitHub
    const result = await syncRepo(repo, token, refresh);

    if (!result.success) {
      // Try to return stale cache on error
      const tickets = await getCachedTickets(repo);
      if (tickets.length > 0) {
        return NextResponse.json({
          format_version: 1,
          tickets: tickets.map(t => ({
            id: t.id,
            short_id: t.shortId,
            display_id: t.displayId,
            title: t.title,
            state: t.state,
            priority: t.priority,
            labels: t.labels,
            assignee: t.assignee,
            reviewer: t.reviewer,
            path: t.path,
            created: t.createdAt?.toISOString(),
            updated: t.cachedAt?.toISOString(),
          })),
          _meta: {
            source: "stale_cache",
            lastSyncedAt: repoRow?.lastSyncedAt?.toISOString(),
            syncStatus: "error",
            syncError: result.error,
            warning: `Using stale cache: ${result.error}`,
          },
        });
      }
      return NextResponse.json(
        { error: result.error, errorCode: result.errorCode },
        { status: 500 }
      );
    }

    // Return freshly synced data
    const tickets = await getCachedTickets(repo);
    const updatedRepo = await getRepo(repo);

    return NextResponse.json({
      format_version: 1,
      tickets: tickets.map(t => ({
        id: t.id,
        short_id: t.shortId,
        display_id: t.displayId,
        title: t.title,
        state: t.state,
        priority: t.priority,
        labels: t.labels,
        assignee: t.assignee,
        reviewer: t.reviewer,
        path: t.path,
        created: t.createdAt?.toISOString(),
        updated: t.cachedAt?.toISOString(),
      })),
      _meta: {
        source: result.changed ? "github" : "cache",
        lastSyncedAt: updatedRepo?.lastSyncedAt?.toISOString(),
        lastIndexSha: result.indexSha,
        syncStatus: "idle",
        changed: result.changed,
      },
    });
  } catch (error) {
    console.error("[tickets] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load tickets" },
      { status: 500 },
    );
  }
}
