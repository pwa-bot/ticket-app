import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { apiSuccess } from "@/lib/api/response";
import { readRepoTicketsWithFallback } from "@/lib/derived-cache-reader";
import { requireRepoAccess } from "@/lib/security/repo-access";

interface RouteParams {
  params: Promise<{ owner: string; repo: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { owner, repo } = await params;
  const { fullName } = await requireRepoAccess(owner, repo);

  const [snapshot, pending] = await Promise.all([
    readRepoTicketsWithFallback(fullName),
    db.query.pendingChanges.findMany({ where: eq(schema.pendingChanges.repoFullName, fullName) }),
  ]);
  const repoRow = snapshot.repo;
  const tickets = snapshot.tickets;

  return apiSuccess({
    tickets,
    pendingChanges: pending,
    source: snapshot.source,
    fallbackReason: snapshot.fallbackReason,
    lastSyncedAt: repoRow?.lastSyncedAt?.toISOString() ?? snapshot.snapshotMeta?.capturedAt ?? null,
    webhookSyncedAt: repoRow?.webhookSyncedAt?.toISOString() ?? null,
    lastIndexSha: snapshot.snapshotMeta?.indexSha ?? repoRow?.lastIndexSha ?? null,
    headSha: snapshot.snapshotMeta?.headSha ?? repoRow?.headSha ?? null,
    syncStatus: repoRow?.syncStatus ?? "idle",
    ticketCount: tickets.length,
  });
}
