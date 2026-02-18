import { NextRequest, NextResponse } from "next/server";
import { getAccessTokenFromCookies } from "@/lib/auth";
import { 
  getCachedTickets, 
  getRepoSyncStatus, 
  syncRepoFromIndex, 
  connectRepo 
} from "@/db/sync";

interface RouteParams {
  params: Promise<{ owner: string; repo: string }>;
}

// How long before we consider cache stale and trigger background refresh
const CACHE_STALE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * GET /api/repos/:owner/:repo/tickets
 * 
 * Returns cached tickets from Postgres.
 * Triggers background sync if cache is stale.
 * Falls back to stale cache on rate limit errors.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const token = await getAccessTokenFromCookies();
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { owner, repo } = await params;
    const repoFullName = `${owner}/${repo}`;
    const forceRefresh = req.nextUrl.searchParams.get("refresh") === "true";

    // Get current sync status
    const syncStatus = await getRepoSyncStatus(repoFullName);
    const now = Date.now();
    const lastSyncTime = syncStatus?.lastSyncedAt?.getTime() || 0;
    const isStale = (now - lastSyncTime) > CACHE_STALE_MS;
    const needsSync = forceRefresh || isStale || !syncStatus?.lastIndexSha;

    // If we have cached data and it's not a force refresh, return it immediately
    // (sync will happen in background or be skipped if SHA unchanged)
    if (syncStatus?.lastIndexSha && !forceRefresh) {
      const tickets = await getCachedTickets(repoFullName);
      
      // Return cached data, optionally triggering background sync
      if (isStale) {
        // Don't await — let sync happen in background
        triggerBackgroundSync(token, repoFullName, owner, repo).catch(console.error);
      }

      return NextResponse.json({
        tickets,
        source: isStale ? "stale_cache" : "cache",
        lastSyncedAt: syncStatus.lastSyncedAt?.toISOString(),
        lastIndexSha: syncStatus.lastIndexSha,
        syncStatus: syncStatus.syncStatus,
        ticketCount: tickets.length,
      });
    }

    // No cache or force refresh — sync now
    const syncResult = await performSync(token, repoFullName, owner, repo);
    
    if (!syncResult.success) {
      // Try to return stale cache on error
      const tickets = await getCachedTickets(repoFullName);
      if (tickets.length > 0) {
        return NextResponse.json({
          tickets,
          source: "stale_cache",
          lastSyncedAt: syncStatus?.lastSyncedAt?.toISOString(),
          syncStatus: "error",
          syncError: syncResult.error,
          ticketCount: tickets.length,
          warning: `Using stale cache: ${syncResult.error}`,
        });
      }
      return NextResponse.json({ error: syncResult.error }, { status: 500 });
    }

    // Return freshly synced data
    const tickets = await getCachedTickets(repoFullName);
    const newStatus = await getRepoSyncStatus(repoFullName);

    return NextResponse.json({
      tickets,
      source: syncResult.changed ? "github" : "cache",
      lastSyncedAt: newStatus?.lastSyncedAt?.toISOString(),
      lastIndexSha: syncResult.indexSha,
      syncStatus: "idle",
      ticketCount: tickets.length,
      changed: syncResult.changed,
    });
  } catch (error) {
    console.error("[tickets] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * Perform SHA-based sync from GitHub.
 */
async function performSync(
  token: string,
  repoFullName: string,
  owner: string,
  repo: string
) {
  // Get user ID for repo connection
  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  
  if (!userRes.ok) {
    return { success: false, changed: false, error: "Failed to get user info" };
  }
  
  const user = await userRes.json() as { id: number };

  // Get repo info
  const repoRes = await fetch(`https://api.github.com/repos/${repoFullName}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });

  if (!repoRes.ok) {
    return { success: false, changed: false, error: "Failed to get repo info" };
  }

  const repoInfo = await repoRes.json() as { default_branch: string };

  // Ensure repo is connected
  await connectRepo(repoFullName, String(user.id), repoInfo.default_branch);

  // Fetch index.json with SHA
  const indexRes = await fetch(
    `https://api.github.com/repos/${repoFullName}/contents/.tickets/index.json?ref=${repoInfo.default_branch}`,
    {
      headers: { 
        Authorization: `Bearer ${token}`, 
        Accept: "application/vnd.github.raw+json",
      },
    }
  );

  if (!indexRes.ok) {
    if (indexRes.status === 404) {
      return { success: false, changed: false, error: "index.json not found. Run `ticket rebuild-index` and push." };
    }
    if (indexRes.status === 403) {
      return { success: false, changed: false, error: "GitHub rate limit exceeded" };
    }
    return { success: false, changed: false, error: `GitHub API error: ${indexRes.status}` };
  }

  // Get SHA from ETag or x-github-media-type header
  // Actually, for contents API we need to make a separate call to get the SHA
  // Let's fetch metadata first
  const metaRes = await fetch(
    `https://api.github.com/repos/${repoFullName}/contents/.tickets/index.json?ref=${repoInfo.default_branch}`,
    {
      headers: { 
        Authorization: `Bearer ${token}`, 
        Accept: "application/vnd.github+json",
      },
    }
  );

  if (!metaRes.ok) {
    return { success: false, changed: false, error: "Failed to get index.json metadata" };
  }

  const meta = await metaRes.json() as { sha: string };
  const indexContent = await indexRes.text();

  // Sync using SHA-based comparison
  return syncRepoFromIndex(repoFullName, indexContent, meta.sha);
}

/**
 * Trigger background sync without blocking the response.
 */
async function triggerBackgroundSync(
  token: string,
  repoFullName: string,
  owner: string,
  repo: string
) {
  try {
    await performSync(token, repoFullName, owner, repo);
  } catch (error) {
    console.error("[background-sync] Error:", error);
  }
}
