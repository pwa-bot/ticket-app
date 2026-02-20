import { NextRequest } from "next/server";
import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { apiSuccess } from "@/lib/api/response";
import { requireSession } from "@/lib/auth";
import type { Priority, TicketState } from "@ticketdotapp/core";
import { assertNoUnauthorizedRepos } from "@/lib/security/repo-access";

const VALID_STATES: TicketState[] = ["backlog", "ready", "in_progress", "blocked", "done"];
const VALID_PRIORITIES: Priority[] = ["p0", "p1", "p2", "p3"];

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 250;

export interface SpaceTicketItem {
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

export interface SpaceTicketRepoSummary {
  fullName: string;
  owner: string;
  repo: string;
  totalTickets: number;
}

export interface SpaceTicketsResponse {
  tickets: SpaceTicketItem[];
  repos: SpaceTicketRepoSummary[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
  loadedAt: string;
}

interface TicketRow {
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

function parseReposParam(value: string | null): Set<string> | null {
  if (!value) {
    return null;
  }

  const repos = value
    .split(",")
    .map((repo) => repo.trim())
    .filter((repo) => repo.includes("/"));

  if (repos.length === 0) {
    return null;
  }

  return new Set(repos);
}

function parseLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(parsed, MAX_LIMIT);
}

function parseOffset(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

/**
 * GET /api/space/tickets
 *
 * Returns all cached tickets across enabled repos.
 * Query params:
 *  - repos=owner/repo,owner/repo2
 *  - state=backlog|ready|in_progress|blocked|done
 *  - priority=p0|p1|p2|p3
 *  - q=search title/id/display_id/labels
 *  - limit,offset pagination
 */
export async function GET(req: NextRequest) {
  const { userId } = await requireSession();

  const userInstalls = await db.query.userInstallations.findMany({
    where: eq(schema.userInstallations.userId, userId),
  });

  if (userInstalls.length === 0) {
    return apiSuccess({
      tickets: [],
      repos: [],
      pagination: { limit: DEFAULT_LIMIT, offset: 0, total: 0, hasMore: false },
      loadedAt: new Date().toISOString(),
    } satisfies SpaceTicketsResponse);
  }

  const installationIds = userInstalls.map((ui) => ui.installationId);
  const installations = await db.query.installations.findMany({
    where: inArray(schema.installations.id, installationIds),
  });
  const ownerLogins = installations
    .map((installation) => installation.githubAccountLogin)
    .filter((value): value is string => Boolean(value));

  const repos = await db.query.repos.findMany({
    where: and(
      eq(schema.repos.enabled, true),
      ownerLogins.length > 0
        ? or(
            inArray(schema.repos.installationId, installationIds),
            inArray(schema.repos.owner, ownerLogins),
          )
        : inArray(schema.repos.installationId, installationIds),
    ),
  });

  if (repos.length === 0) {
    return apiSuccess({
      tickets: [],
      repos: [],
      pagination: { limit: DEFAULT_LIMIT, offset: 0, total: 0, hasMore: false },
      loadedAt: new Date().toISOString(),
    } satisfies SpaceTicketsResponse);
  }

  const { searchParams } = new URL(req.url);
  const repoFilter = parseReposParam(searchParams.get("repos"));
  const stateParam = searchParams.get("state");
  const priorityParam = searchParams.get("priority");
  const q = searchParams.get("q")?.trim() ?? "";
  const limit = parseLimit(searchParams.get("limit"));
  const offset = parseOffset(searchParams.get("offset"));

  const state = VALID_STATES.includes(stateParam as TicketState) ? (stateParam as TicketState) : null;
  const priority = VALID_PRIORITIES.includes(priorityParam as Priority) ? (priorityParam as Priority) : null;

  const enabledRepoFullNames = repos.map((repo) => repo.fullName);
  if (repoFilter) {
    assertNoUnauthorizedRepos(repoFilter, enabledRepoFullNames);
  }
  const targetRepos = repoFilter
    ? enabledRepoFullNames.filter((fullName) => repoFilter.has(fullName))
    : enabledRepoFullNames;

  const repoCounts = await db.select({
    repoFullName: schema.tickets.repoFullName,
    total: sql<number>`count(*)`,
  })
    .from(schema.tickets)
    .where(inArray(schema.tickets.repoFullName, enabledRepoFullNames))
    .groupBy(schema.tickets.repoFullName);

  const repoCountMap = new Map(repoCounts.map((row) => [row.repoFullName, Number(row.total)]));

  const repoSummaries: SpaceTicketRepoSummary[] = repos.map((repo) => ({
    fullName: repo.fullName,
    owner: repo.owner,
    repo: repo.repo,
    totalTickets: repoCountMap.get(repo.fullName) ?? 0,
  }));

  if (targetRepos.length === 0) {
    return apiSuccess({
      tickets: [],
      repos: repoSummaries,
      pagination: { limit, offset, total: 0, hasMore: false },
      loadedAt: new Date().toISOString(),
    } satisfies SpaceTicketsResponse);
  }

  const conditions = [inArray(schema.tickets.repoFullName, targetRepos)];

  if (state) {
    conditions.push(eq(schema.tickets.state, state));
  }

  if (priority) {
    conditions.push(eq(schema.tickets.priority, priority));
  }

  if (q.length > 0) {
    const likeQuery = `%${q}%`;
    conditions.push(
      or(
        ilike(schema.tickets.title, likeQuery),
        ilike(schema.tickets.id, likeQuery),
        ilike(schema.tickets.displayId, likeQuery),
        sql`${schema.tickets.labels}::text ILIKE ${likeQuery}`,
      )!,
    );
  }

  const whereClause = and(...conditions);

  const [countRows, rows] = await Promise.all([
    db.select({ total: sql<number>`count(*)` }).from(schema.tickets).where(whereClause),
    db
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
      .where(whereClause)
      .orderBy(
        sql`case ${schema.tickets.state}
          when 'backlog' then 0
          when 'ready' then 1
          when 'in_progress' then 2
          when 'blocked' then 3
          when 'done' then 4
          else 99
        end`,
        sql`case ${schema.tickets.priority}
          when 'p0' then 0
          when 'p1' then 1
          when 'p2' then 2
          when 'p3' then 3
          else 99
        end`,
        asc(schema.tickets.createdAt),
        asc(schema.tickets.id),
      )
      .limit(limit)
      .offset(offset),
  ]);

  const repoLookup = new Map(repos.map((repo) => [repo.fullName, repo]));
  const total = Number(countRows[0]?.total ?? 0);
  const typedRows = rows as unknown as TicketRow[];

  const tickets: SpaceTicketItem[] = typedRows.map((row) => {
    const repo = repoLookup.get(row.repoFullName);

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

  return apiSuccess({
    tickets,
    repos: repoSummaries,
    pagination: {
      limit,
      offset,
      total,
      hasMore: offset + tickets.length < total,
    },
    loadedAt: new Date().toISOString(),
  } satisfies SpaceTicketsResponse);
}
