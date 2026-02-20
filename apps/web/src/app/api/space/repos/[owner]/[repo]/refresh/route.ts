import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { syncRepo } from "@/db/sync";
import { applyMutationGuards } from "@/lib/security/mutation-guard";
import { requireRepoAccess } from "@/lib/security/repo-access";

interface Params {
  params: Promise<{ owner: string; repo: string }>;
}

/**
 * POST /api/space/repos/:owner/:repo/refresh
 * 
 * Triggers a sync job for the repo.
 * For Phase A (no job queue), this runs synchronously.
 * TODO: Enqueue job and return immediately when we add Redis.
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
    return NextResponse.json({ error: "Repo not found" }, { status: 404 });
  }

  // Mark as syncing
  await db
    .insert(schema.repoSyncState)
    .values({
      repoId: repo.id,
      status: "syncing",
    })
    .onConflictDoUpdate({
      target: schema.repoSyncState.repoId,
      set: {
        status: "syncing",
      },
    });

  try {
    // For Phase A, run sync synchronously using existing sync function
    // This still makes GitHub API calls, but only when user explicitly refreshes
    const result = await syncRepo(fullName, session.token, true);

    if (!result.success) {
      await db
        .update(schema.repoSyncState)
        .set({
          status: "error",
          errorCode: result.errorCode ?? "sync_failed",
          errorMessage: result.error ?? "Sync failed",
        })
        .where(eq(schema.repoSyncState.repoId, repo.id));

      return NextResponse.json({
        ok: false,
        error: result.error,
        errorCode: result.errorCode,
      });
    }

    // Update sync state
    await db
      .update(schema.repoSyncState)
      .set({
        status: "ok",
        headSha: result.indexSha ?? null,
        lastSyncedAt: new Date(),
        errorCode: null,
        errorMessage: null,
      })
      .where(eq(schema.repoSyncState.repoId, repo.id));

    // Also store snapshot if we have the index data
    // (The existing syncRepo function already stores in tickets table)

    return NextResponse.json({
      ok: true,
      changed: result.changed,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    await db
      .update(schema.repoSyncState)
      .set({
        status: "error",
        errorCode: "sync_exception",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      })
      .where(eq(schema.repoSyncState.repoId, repo.id));

    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}
