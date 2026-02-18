import { NextRequest, NextResponse } from "next/server";
import { getAccessTokenFromCookies } from "@/lib/auth";
import { syncRepoFromIndex, connectRepo, getRepoSyncStatus } from "@/db/sync";

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
    const token = await getAccessTokenFromCookies();
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { owner, repo } = await params;
    const repoFullName = `${owner}/${repo}`;

    // Get user ID
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });
    
    if (!userResponse.ok) {
      return NextResponse.json({ error: "Failed to get user info" }, { status: 500 });
    }
    
    const user = await userResponse.json() as { id: number };

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

    const repoInfo = await repoResponse.json() as { default_branch: string };

    // Ensure repo is connected
    await connectRepo(repoFullName, String(user.id), repoInfo.default_branch);

    // Fetch index.json metadata (for SHA)
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
      if (metaRes.status === 404) {
        return NextResponse.json({ 
          error: "index.json not found. Run `ticket rebuild-index` and push." 
        }, { status: 404 });
      }
      return NextResponse.json({ error: `GitHub API error: ${metaRes.status}` }, { status: 500 });
    }

    const meta = await metaRes.json() as { sha: string; download_url: string };

    // Fetch raw content
    const contentRes = await fetch(
      `https://api.github.com/repos/${repoFullName}/contents/.tickets/index.json?ref=${repoInfo.default_branch}`,
      {
        headers: { 
          Authorization: `Bearer ${token}`, 
          Accept: "application/vnd.github.raw+json",
        },
      }
    );

    if (!contentRes.ok) {
      return NextResponse.json({ error: "Failed to fetch index.json content" }, { status: 500 });
    }

    const indexContent = await contentRes.text();

    // Sync using SHA-based comparison
    const result = await syncRepoFromIndex(repoFullName, indexContent, meta.sha);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      changed: result.changed,
      ticketCount: result.ticketCount,
      indexSha: result.indexSha,
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

    const status = await getRepoSyncStatus(repoFullName);

    if (!status) {
      return NextResponse.json({ 
        synced: false,
        message: "Repo not synced yet"
      });
    }

    return NextResponse.json({
      synced: true,
      syncStatus: status.syncStatus,
      lastSyncedAt: status.lastSyncedAt?.toISOString(),
      lastIndexSha: status.lastIndexSha,
      syncError: status.syncError,
    });
  } catch (error) {
    console.error("[sync] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
