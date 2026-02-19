import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { requireSession } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ owner: string; repo: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  await requireSession();

  const { owner, repo } = await params;
  const fullName = `${owner}/${repo}`;

  const [repoRow, tickets, pending] = await Promise.all([
    db.query.repos.findFirst({ where: eq(schema.repos.fullName, fullName) }),
    db.query.tickets.findMany({ where: eq(schema.tickets.repoFullName, fullName) }),
    db.query.pendingChanges.findMany({ where: eq(schema.pendingChanges.repoFullName, fullName) }),
  ]);

  return NextResponse.json({
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
