import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db, schema } from "@/db/client";
import { apiError, apiSuccess } from "@/lib/api/response";
import { readRepoTicketsWithFallback } from "@/lib/derived-cache-reader";
import { requireRepoAccess } from "@/lib/security/repo-access";
import { computeSyncHealth } from "@/lib/sync-health";

interface Params {
  params: Promise<{ owner: string; repo: string }>;
}

function checksToUi(status: string): "success" | "failure" | "pending" | "unknown" {
  if (status === "pass") return "success";
  if (status === "fail") return "failure";
  if (status === "running") return "pending";
  return "unknown";
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { owner, repo: repoName } = await params;
  const { fullName } = await requireRepoAccess(owner, repoName);

  const [snapshot, prs] = await Promise.all([
    readRepoTicketsWithFallback(fullName),
    db.query.ticketPrs.findMany({ where: eq(schema.ticketPrs.repoFullName, fullName) }),
  ]);
  const repo = snapshot.repo;
  const tickets = snapshot.tickets;

  if (!repo) {
    return apiError("Repo not found", { status: 404 });
  }

  const ticketToPrs: Record<string, Array<{
    prNumber: number;
    url: string;
    title: string | null;
    state: string | null;
    merged: boolean | null;
    mergeableState: string | null;
    checks: { status: "success" | "failure" | "pending" | "unknown" };
  }>> = {};

  for (const pr of prs) {
    if (!ticketToPrs[pr.ticketId]) {
      ticketToPrs[pr.ticketId] = [];
    }
    ticketToPrs[pr.ticketId].push({
      prNumber: pr.prNumber,
      url: pr.prUrl,
      title: pr.title,
      state: pr.state,
      merged: pr.merged,
      mergeableState: pr.mergeableState,
      checks: { status: checksToUi(pr.checksState) },
    });
  }

  return apiSuccess({
    index: {
      format_version: 1,
      tickets: tickets,
    },
    ticketToPrs,
    syncedAt: repo.lastSyncedAt?.toISOString() ?? snapshot.snapshotMeta?.capturedAt ?? null,
    headSha: snapshot.snapshotMeta?.headSha ?? repo.headSha ?? null,
    stale: !repo.webhookSyncedAt,
    source: snapshot.source,
    fallbackReason: snapshot.fallbackReason,
    syncStatus: repo.syncStatus,
    syncHealth: computeSyncHealth({
      syncStatus: repo.syncStatus,
      syncError: repo.syncError,
      lastSyncedAt: repo.lastSyncedAt,
    }),
    syncError: repo.syncError
      ? {
          code: "sync_error",
          message: repo.syncError,
        }
      : null,
  });
}
