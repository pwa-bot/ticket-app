import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { requireSession } from "@/lib/auth";
import { hasRepoAccess } from "@/lib/security/repo-access";

export async function GET(request: Request) {
  const { userId } = await requireSession();

  const url = new URL(request.url);
  const repo = url.searchParams.get("repo");

  if (!repo) {
    return NextResponse.json({ error: "Missing repo query parameter" }, { status: 400 });
  }

  const [owner, repoName] = repo.split("/");
  if (!owner || !repoName || !(await hasRepoAccess(userId, `${owner}/${repoName}`))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [repoRow, tickets] = await Promise.all([
    db.query.repos.findFirst({ where: eq(schema.repos.fullName, repo) }),
    db.query.tickets.findMany({ where: eq(schema.tickets.repoFullName, repo) }),
  ]);

  return NextResponse.json({
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
    },
  });
}
