import { NextRequest, NextResponse } from "next/server";
import { getAccessTokenFromCookies } from "@/lib/auth";
import { getCachedTickets, getSyncStatus, isRepoConnected } from "@/db/sync";
import { getTicketIndex } from "@/lib/github";
import { syncRepoTickets, connectRepo } from "@/db/sync";

interface RouteParams {
  params: Promise<{ owner: string; repo: string }>;
}

// How long before we consider cache stale (5 minutes)
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * GET /api/repos/:owner/:repo/tickets
 * 
 * Get tickets for a repo, preferring cached data.
 * Will sync from GitHub if cache is stale or empty.
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

    // Check if repo is connected and has recent sync
    const status = await getSyncStatus(repoFullName);
    const isCacheValid = status?.lastSuccessAt && 
      (Date.now() - status.lastSuccessAt.getTime()) < CACHE_TTL_MS &&
      !forceRefresh;

    if (isCacheValid) {
      // Return cached data
      const tickets = await getCachedTickets(repoFullName);
      return NextResponse.json({
        tickets,
        source: "cache",
        syncedAt: status.lastSuccessAt?.toISOString(),
        ticketCount: tickets.length,
      });
    }

    // Need to sync from GitHub
    console.log(`[tickets] Syncing ${repoFullName} from GitHub`);

    // Get user and repo info for initial setup
    const [userRes, repoRes] = await Promise.all([
      fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
      }),
      fetch(`https://api.github.com/repos/${repoFullName}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
      }),
    ]);

    if (!userRes.ok || !repoRes.ok) {
      return NextResponse.json({ error: "Failed to get GitHub info" }, { status: 500 });
    }

    const user = await userRes.json() as { id: number };
    const repoInfo = await repoRes.json() as { default_branch: string; private: boolean };

    // Ensure repo is connected
    await connectRepo(repoFullName, String(user.id), repoInfo.default_branch, repoInfo.private);

    // Fetch and sync
    const index = await getTicketIndex(token, repoFullName);
    const result = await syncRepoTickets(repoFullName, index, index.generated_at);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    // Return the synced tickets
    const tickets = await getCachedTickets(repoFullName);
    return NextResponse.json({
      tickets,
      source: "github",
      syncedAt: new Date().toISOString(),
      ticketCount: tickets.length,
    });
  } catch (error) {
    console.error("[tickets] Error:", error);
    
    // If it's a rate limit error, try to return stale cache
    if (error instanceof Error && error.message.includes("403")) {
      const { owner, repo } = await params;
      const repoFullName = `${owner}/${repo}`;
      const tickets = await getCachedTickets(repoFullName);
      
      if (tickets.length > 0) {
        const status = await getSyncStatus(repoFullName);
        return NextResponse.json({
          tickets,
          source: "stale_cache",
          syncedAt: status?.lastSuccessAt?.toISOString(),
          ticketCount: tickets.length,
          warning: "Using stale cache due to rate limit",
        });
      }
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
