import { NextRequest } from "next/server";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { apiSuccess } from "@/lib/api/response";
import { requireSession } from "@/lib/auth";
import { assertNoUnauthorizedRepos, listAccessibleRepos } from "@/lib/security/repo-access";
import { computeSyncHealth } from "@/lib/sync-health";

export interface SpaceRepoSyncHealth {
  fullName: string;
  owner: string;
  repo: string;
  health: ReturnType<typeof computeSyncHealth>;
}

export interface SpaceSyncHealthResponse {
  repos: SpaceRepoSyncHealth[];
  summary: {
    total: number;
    healthy: number;
    stale: number;
    error: number;
    syncing: number;
    neverSynced: number;
    staleThresholdMs: number;
  };
  loadedAt: string;
}

function parseReposParam(value: string | null): Set<string> | null {
  if (!value) {
    return null;
  }

  const repos = value
    .split(",")
    .map((repo) => repo.trim())
    .filter((repo) => repo.includes("/"));
  return repos.length > 0 ? new Set(repos) : null;
}

/**
 * GET /api/space/sync-health
 *
 * Read-only cache endpoint for repo sync observability.
 * Returns per-repo sync health (last sync, age, staleness, and error state).
 */
export async function GET(req: NextRequest) {
  const nowMs = Date.now();
  const defaultSnapshot = computeSyncHealth({}, { nowMs });
  const { userId } = await requireSession();
  const repos = await listAccessibleRepos({ userId, enabledOnly: true });

  if (repos.length === 0) {
    return apiSuccess({
      repos: [],
      summary: {
        total: 0,
        healthy: 0,
        stale: 0,
        error: 0,
        syncing: 0,
        neverSynced: 0,
        staleThresholdMs: defaultSnapshot.staleAfterMs,
      },
      loadedAt: new Date().toISOString(),
    } satisfies SpaceSyncHealthResponse);
  }

  const repoFilter = parseReposParam(new URL(req.url).searchParams.get("repos"));
  if (repoFilter) {
    assertNoUnauthorizedRepos(repoFilter, repos.map((repo) => repo.fullName));
  }

  const targetRepos = repoFilter ? repos.filter((repo) => repoFilter.has(repo.fullName)) : repos;
  if (targetRepos.length === 0) {
    return apiSuccess({
      repos: [],
      summary: {
        total: 0,
        healthy: 0,
        stale: 0,
        error: 0,
        syncing: 0,
        neverSynced: 0,
        staleThresholdMs: defaultSnapshot.staleAfterMs,
      },
      loadedAt: new Date().toISOString(),
    } satisfies SpaceSyncHealthResponse);
  }

  const repoRows = await db.query.repos.findMany({
    where: inArray(schema.repos.fullName, targetRepos.map((repo) => repo.fullName)),
  });

  const repoByFullName = new Map(repoRows.map((repo) => [repo.fullName, repo]));
  const snapshots = targetRepos.map((repo) => ({
    fullName: repo.fullName,
    owner: repo.owner,
    repo: repo.repo,
    health: computeSyncHealth({
      syncStatus: repoByFullName.get(repo.fullName)?.syncStatus ?? "idle",
      syncError: repoByFullName.get(repo.fullName)?.syncError ?? null,
      lastSyncedAt: repoByFullName.get(repo.fullName)?.lastSyncedAt ?? null,
    }, { nowMs }),
  }));

  const summary = snapshots.reduce(
    (acc, item) => {
      acc.total += 1;
      if (item.health.state === "healthy") acc.healthy += 1;
      if (item.health.state === "stale") acc.stale += 1;
      if (item.health.state === "error") acc.error += 1;
      if (item.health.state === "syncing") acc.syncing += 1;
      if (item.health.state === "never_synced") acc.neverSynced += 1;
      return acc;
    },
    {
      total: 0,
      healthy: 0,
      stale: 0,
      error: 0,
      syncing: 0,
      neverSynced: 0,
      staleThresholdMs: snapshots[0]?.health.staleAfterMs ?? defaultSnapshot.staleAfterMs,
    },
  );

  return apiSuccess({
    repos: snapshots,
    summary,
    loadedAt: new Date().toISOString(),
  } satisfies SpaceSyncHealthResponse);
}
