import { NextRequest, NextResponse } from "next/server";
import { eq, desc, and } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { getAccessTokenFromCookies } from "@/lib/auth";

interface Params {
  params: Promise<{ owner: string; repo: string }>;
}

/**
 * GET /api/space/repos/:owner/:repo/board
 * 
 * Combined board payload - reads from Postgres cache only.
 * No GitHub API calls on the hot path.
 * 
 * Returns:
 * - index: latest ticket index snapshot
 * - ticketToPrs: PR map keyed by ticket short ID
 * - syncedAt: when cache was last updated
 * - stale: true if cache is >10 minutes old
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const token = await getAccessTokenFromCookies();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { owner, repo: repoName } = await params;
  const fullName = `${owner}/${repoName}`;

  // Find the repo
  const repo = await db.query.repos.findFirst({
    where: eq(schema.repos.fullName, fullName),
  });

  if (!repo) {
    return NextResponse.json({ error: "Repo not found" }, { status: 404 });
  }

  // Get sync state
  const syncState = await db.query.repoSyncState.findFirst({
    where: eq(schema.repoSyncState.repoId, repo.id),
  });

  // Get latest index snapshot
  const snapshot = await db.query.ticketIndexSnapshots.findFirst({
    where: eq(schema.ticketIndexSnapshots.repoId, repo.id),
    orderBy: desc(schema.ticketIndexSnapshots.createdAt),
  });

  // Get PR cache with checks
  const prs = await db.query.prCache.findMany({
    where: eq(schema.prCache.repoId, repo.id),
  });

  const checks = await db.query.prChecksCache.findMany({
    where: eq(schema.prChecksCache.repoId, repo.id),
  });

  // Build checks lookup
  const checksMap = new Map<number, string>();
  for (const check of checks) {
    checksMap.set(check.prNumber, check.status);
  }

  // Build ticket -> PRs map
  const ticketToPrs: Record<string, Array<{
    prNumber: number;
    url: string;
    title: string | null;
    state: string | null;
    merged: boolean | null;
    mergeableState: string | null;
    checks: { status: string };
  }>> = {};

  for (const pr of prs) {
    const prEntry = {
      prNumber: pr.prNumber,
      url: pr.prUrl,
      title: pr.title,
      state: pr.state,
      merged: pr.merged,
      mergeableState: pr.mergeableState,
      checks: { status: checksMap.get(pr.prNumber) ?? "unknown" },
    };

    for (const shortId of pr.linkedTicketShortIds ?? []) {
      if (!ticketToPrs[shortId]) {
        ticketToPrs[shortId] = [];
      }
      ticketToPrs[shortId].push(prEntry);
    }
  }

  // Determine staleness (>10 minutes)
  const syncedAt = syncState?.lastSyncedAt ?? snapshot?.createdAt ?? null;
  const staleMs = 10 * 60 * 1000; // 10 minutes
  const stale = syncedAt ? Date.now() - new Date(syncedAt).getTime() > staleMs : true;

  // If no snapshot, try to fall back to tickets table
  if (!snapshot) {
    // Fall back to direct tickets query
    const tickets = await db.query.tickets.findMany({
      where: eq(schema.tickets.repoFullName, fullName),
    });

    if (tickets.length > 0) {
      return NextResponse.json({
        index: {
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
          })),
        },
        ticketToPrs,
        syncedAt: syncedAt?.toISOString() ?? null,
        headSha: syncState?.headSha ?? null,
        stale,
        source: "tickets_table",
        syncStatus: syncState?.status ?? "unknown",
        syncError: syncState?.errorCode ? {
          code: syncState.errorCode,
          message: syncState.errorMessage,
        } : null,
      });
    }

    // No data at all
    return NextResponse.json({
      index: null,
      ticketToPrs: {},
      syncedAt: null,
      headSha: null,
      stale: true,
      source: "none",
      syncStatus: syncState?.status ?? "unknown",
      syncError: syncState?.errorCode ? {
        code: syncState.errorCode,
        message: syncState.errorMessage,
      } : null,
    });
  }

  return NextResponse.json({
    index: snapshot.indexJson,
    ticketToPrs,
    syncedAt: syncedAt?.toISOString() ?? null,
    headSha: snapshot.headSha,
    stale,
    source: "snapshot",
    syncStatus: syncState?.status ?? "ok",
    syncError: syncState?.errorCode ? {
      code: syncState.errorCode,
      message: syncState.errorMessage,
    } : null,
  });
}
