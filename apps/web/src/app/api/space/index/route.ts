import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireSession } from "@/lib/auth";
import { assertNoUnauthorizedRepos } from "@/lib/security/repo-access";

export interface SpaceIndexTicket {
  repoFullName: string;
  repoOwner: string;
  repoName: string;
  id: string;
  shortId: string;
  displayId: string;
  title: string;
  state: string;
  priority: string;
  labels: string[];
  path: string;
  assignee?: string | null;
  reviewer?: string | null;
  createdAt?: string | null;
  cachedAt: string;
}

export interface SpaceIndexRepoSummary {
  fullName: string;
  owner: string;
  repo: string;
  totalTickets: number;
}

export interface SpaceIndexTotals {
  reposEnabled: number;
  reposSelected: number;
  ticketsTotal: number;
}

export interface SpaceIndexResponse {
  tickets: SpaceIndexTicket[];
  repos: SpaceIndexRepoSummary[];
  totals: SpaceIndexTotals;
  loadedAt: string;
}

interface IndexTicketRow {
  repoFullName: string;
  id: string;
  shortId: string;
  displayId: string;
  title: string;
  state: string;
  priority: string;
  labels: unknown;
  path: string;
  assignee: string | null;
  reviewer: string | null;
  createdAt: Date | null;
  cachedAt: Date;
}

function emptyResponse(
  repos: SpaceIndexRepoSummary[],
  reposEnabled: number,
  reposSelected: number,
): SpaceIndexResponse {
  return {
    tickets: [],
    repos,
    totals: { reposEnabled, reposSelected, ticketsTotal: 0 },
    loadedAt: new Date().toISOString(),
  };
}

/**
 * GET /api/space/index
 *
 * Returns the full ticket list for selected repos — no pagination.
 * Intended for the dashboard "All tickets" view which groups client-side by state.
 * Reads from tickets table (Postgres cache). Zero GitHub API calls.
 *
 * Query param: ?repos=owner/repo,owner/repo2 (optional, defaults to all enabled repos)
 */
export async function GET(req: NextRequest) {
  const { userId } = await requireSession();

  const { searchParams } = new URL(req.url);
  const repoParam = searchParams.get("repos");
  const filterSet = repoParam
    ? new Set(repoParam.split(",").map((r) => r.trim()).filter((r) => r.includes("/")))
    : null;

  const userInstalls = await db.query.userInstallations.findMany({
    where: eq(schema.userInstallations.userId, userId),
  });

  if (userInstalls.length === 0) {
    return NextResponse.json(emptyResponse([], 0, 0) satisfies SpaceIndexResponse);
  }

  const installationIds = userInstalls.map((ui) => ui.installationId);

  const repos = await db.query.repos.findMany({
    where: and(
      eq(schema.repos.enabled, true),
      inArray(schema.repos.installationId, installationIds),
    ),
  });

  if (filterSet) {
    assertNoUnauthorizedRepos(filterSet, repos.map((r) => r.fullName));
  }

  const targetRepos = filterSet
    ? repos.filter((r) => filterSet.has(r.fullName))
    : repos;

  // Build repo summary map (will accumulate ticket counts below)
  const repoSummaryMap = new Map<string, SpaceIndexRepoSummary>();
  for (const repo of repos) {
    repoSummaryMap.set(repo.fullName, {
      fullName: repo.fullName,
      owner: repo.owner,
      repo: repo.repo,
      totalTickets: 0,
    });
  }

  if (targetRepos.length === 0) {
    return NextResponse.json(
      emptyResponse(
        Array.from(repoSummaryMap.values()),
        repos.length,
        0,
      ) satisfies SpaceIndexResponse,
    );
  }

  const repoLookup = new Map(repos.map((r) => [r.fullName, r]));
  const targetRepoFullNames = targetRepos.map((r) => r.fullName);

  const rows = await db
    .select({
      repoFullName: schema.tickets.repoFullName,
      id: schema.tickets.id,
      shortId: schema.tickets.shortId,
      displayId: schema.tickets.displayId,
      title: schema.tickets.title,
      state: schema.tickets.state,
      priority: schema.tickets.priority,
      labels: schema.tickets.labels,
      path: schema.tickets.path,
      assignee: schema.tickets.assignee,
      reviewer: schema.tickets.reviewer,
      createdAt: schema.tickets.createdAt,
      cachedAt: schema.tickets.cachedAt,
    })
    .from(schema.tickets)
    .where(inArray(schema.tickets.repoFullName, targetRepoFullNames))
    .orderBy(
      sql`case ${schema.tickets.priority}
        when 'p0' then 0
        when 'p1' then 1
        when 'p2' then 2
        when 'p3' then 3
        else 99
      end`,
      asc(schema.tickets.createdAt),
      asc(schema.tickets.id),
    );

  const typedRows = rows as unknown as IndexTicketRow[];
  const tickets: SpaceIndexTicket[] = typedRows.map((row) => {
    const repo = repoLookup.get(row.repoFullName);
    const summary = repoSummaryMap.get(row.repoFullName);
    if (summary) {
      summary.totalTickets++;
    }

    return {
      repoFullName: row.repoFullName,
      repoOwner: repo?.owner ?? row.repoFullName.split("/")[0] ?? "",
      repoName: repo?.repo ?? row.repoFullName.split("/")[1] ?? "",
      id: row.id,
      shortId: row.shortId,
      displayId: row.displayId,
      title: row.title,
      state: row.state,
      priority: row.priority,
      labels: (row.labels as string[]) ?? [],
      path: row.path,
      assignee: row.assignee,
      reviewer: row.reviewer,
      createdAt: row.createdAt?.toISOString() ?? null,
      cachedAt: row.cachedAt.toISOString(),
    };
  });

  return NextResponse.json({
    tickets,
    repos: Array.from(repoSummaryMap.values()),
    totals: {
      reposEnabled: repos.length,
      reposSelected: targetRepos.length,
      ticketsTotal: tickets.length,
    },
    loadedAt: new Date().toISOString(),
  } satisfies SpaceIndexResponse);
}
