import { NextRequest, NextResponse } from "next/server";
import { getAccessTokenFromCookies } from "@/lib/auth";
import { getTicketIndex } from "@/lib/github";
import { syncRepoTickets, connectRepo, getSyncStatus } from "@/db/sync";

interface RouteParams {
  params: Promise<{ owner: string; repo: string }>;
}

/**
 * POST /api/repos/:owner/:repo/sync
 * 
 * Sync a repo's tickets from GitHub to the local cache.
 * Called when user first opens a repo or manually refreshes.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const token = await getAccessTokenFromCookies();
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { owner, repo } = await params;
    const repoFullName = `${owner}/${repo}`;

    // Get user ID from GitHub (we could cache this)
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });
    
    if (!userResponse.ok) {
      return NextResponse.json({ error: "Failed to get user info" }, { status: 500 });
    }
    
    const user = await userResponse.json() as { id: number; login: string };
    const userId = String(user.id);

    // Get repo info
    const repoResponse = await fetch(`https://api.github.com/repos/${repoFullName}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });

    if (!repoResponse.ok) {
      return NextResponse.json({ error: "Failed to get repo info" }, { status: 500 });
    }

    const repoInfo = await repoResponse.json() as { default_branch: string; private: boolean };

    // Connect/update repo in database
    await connectRepo(repoFullName, userId, repoInfo.default_branch, repoInfo.private);

    // Fetch ticket index from GitHub
    const index = await getTicketIndex(token, repoFullName);

    // Sync to database
    const result = await syncRepoTickets(
      repoFullName,
      index,
      index.generated_at
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      ticketCount: result.ticketCount,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
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
    const repoFullName = `${owner}/${repo}`;

    const status = await getSyncStatus(repoFullName);

    if (!status) {
      return NextResponse.json({ 
        synced: false,
        message: "Repo not synced yet"
      });
    }

    return NextResponse.json({
      synced: true,
      status: status.status,
      lastSuccessAt: status.lastSuccessAt?.toISOString(),
      ticketCount: status.ticketCount,
      indexGeneratedAt: status.indexGeneratedAt?.toISOString(),
      errorMessage: status.errorMessage,
    });
  } catch (error) {
    console.error("[sync] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
