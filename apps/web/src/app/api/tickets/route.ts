import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { apiError, apiSuccess } from "@/lib/api/response";
import { requireSession } from "@/lib/auth";
import { hasRepoAccess } from "@/lib/security/repo-access";
import { getManualRefreshJobService } from "@/lib/services/manual-refresh-job-service";
import { computeSyncHealth } from "@/lib/sync-health";

export async function GET(request: Request) {
  const { userId } = await requireSession();

  const url = new URL(request.url);
  const repo = url.searchParams.get("repo");
  const refresh = url.searchParams.get("refresh") === "1";

  if (!repo) {
    return apiError("Missing repo query parameter", { status: 400 });
  }

  const [owner, repoName] = repo.split("/");
  if (!owner || !repoName || !(await hasRepoAccess(userId, `${owner}/${repoName}`))) {
    return apiError("Forbidden", { status: 403 });
  }

  let refreshJob: { id: string; status: string; queued: boolean } | null = null;
  if (refresh) {
    const service = getManualRefreshJobService();
    try {
      const result = await service.enqueueRefresh({
        repoFullName: repo,
        requestedByUserId: userId,
        force: true,
      });
      refreshJob = {
        id: result.job.id,
        status: result.job.status,
        queued: result.enqueued,
      };
    } catch {
      // Keep serving cached data even if enqueue fails.
    }
  }

  const [repoRow, tickets] = await Promise.all([
    db.query.repos.findFirst({ where: eq(schema.repos.fullName, repo) }),
    db.query.tickets.findMany({ where: eq(schema.tickets.repoFullName, repo) }),
  ]);
  const syncHealth = computeSyncHealth({
    syncStatus: repoRow?.syncStatus ?? "idle",
    syncError: repoRow?.syncError ?? null,
    lastSyncedAt: repoRow?.lastSyncedAt ?? null,
  });

  return apiSuccess({
    format_version: 1,
    tickets: tickets.map((t) => ({
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
      source: "postgres_cache",
      lastSyncedAt: repoRow?.lastSyncedAt?.toISOString(),
      lastIndexSha: repoRow?.lastIndexSha ?? null,
      headSha: repoRow?.headSha ?? null,
      webhookSyncedAt: repoRow?.webhookSyncedAt?.toISOString() ?? null,
      syncStatus: repoRow?.syncStatus ?? "idle",
      stale: !repoRow?.webhookSyncedAt,
      syncHealth,
    },
    refreshJob,
  });
}
