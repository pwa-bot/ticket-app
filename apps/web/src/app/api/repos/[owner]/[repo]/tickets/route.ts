import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db, schema } from "@/db/client";
import { apiSuccess } from "@/lib/api/response";
import { requireRepoAccess } from "@/lib/security/repo-access";

interface RouteParams {
  params: Promise<{ owner: string; repo: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { owner, repo } = await params;
  const { fullName } = await requireRepoAccess(owner, repo);

  const [repoRow, tickets, pending] = await Promise.all([
    db.query.repos.findFirst({ where: eq(schema.repos.fullName, fullName) }),
    db.query.tickets.findMany({ where: eq(schema.tickets.repoFullName, fullName) }),
    db.query.pendingChanges.findMany({ where: eq(schema.pendingChanges.repoFullName, fullName) }),
  ]);

  return apiSuccess({
    tickets,
    pendingChanges: pending,
    source: "postgres_cache",
    lastSyncedAt: repoRow?.lastSyncedAt?.toISOString() ?? null,
    webhookSyncedAt: repoRow?.webhookSyncedAt?.toISOString() ?? null,
    lastIndexSha: repoRow?.lastIndexSha ?? null,
    headSha: repoRow?.headSha ?? null,
    syncStatus: repoRow?.syncStatus ?? "idle",
    ticketCount: tickets.length,
  });
}
