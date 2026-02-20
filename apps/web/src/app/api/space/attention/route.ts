import { NextRequest } from "next/server";
import { eq, inArray, and, ne, or, sql, lt } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { apiSuccess } from "@/lib/api/response";
import { requireSession } from "@/lib/auth";
import type { CiStatus, MergeReadiness } from "@/lib/attention";
import { compareAttentionItems, getReasonCatalog, toReasonDetails, type AttentionReason } from "@/lib/attention-contract";
import type { AttentionReasonDetail } from "@/lib/attention-contract";
import { assertNoUnauthorizedRepos } from "@/lib/security/repo-access";

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface AttentionPrSummary {
  prNumber: number;
  url: string;
  title: string | null;
  state: string | null;
  merged: boolean | null;
  mergeableState: string | null;
  checksStatus: string;
  reviewRequired: boolean;
  ciStatus: CiStatus;
}

export interface AttentionItem {
  repoFullName: string;
  ticketId: string;
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
  reasons: AttentionReason[];
  reasonDetails: AttentionReasonDetail[];
  primaryReason: AttentionReason;
  prs: AttentionPrSummary[];
  mergeReadiness: MergeReadiness;
  hasPendingChange: boolean;
}

export interface EnabledRepoSummary {
  fullName: string;
  owner: string;
  repo: string;
  totalTickets: number;
  attentionTickets: number;
}

export interface AttentionTotals {
  reposEnabled: number;
  reposSelected: number;
  ticketsTotal: number;
  ticketsAttention: number;
}

export interface AttentionResponse {
  items: AttentionItem[];
  repos: EnabledRepoSummary[];
  totals: AttentionTotals;
  reasonCatalog: AttentionReasonDetail[];
  loadedAt: string;
}

interface RepoTicketCountRow {
  repoFullName: string;
  total: number;
}

interface AttentionTicketRow {
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
  hasPendingChange: boolean;
  hasOpenPr: boolean;
  hasCiFailing: boolean;
}

function ticketLookupKey(repoFullName: string, ticketId: string): string {
  return `${repoFullName}:${ticketId}`;
}

function checksStatusToCiStatus(status: string): CiStatus {
  switch (status) {
    case "pass": return "success";
    case "fail": return "failure";
    case "running": return "pending";
    default: return "unknown";
  }
}

function derivePrMergeReadiness(pr: AttentionPrSummary): MergeReadiness {
  if (pr.mergeableState === "dirty" || pr.mergeableState === "blocked") return "CONFLICT";
  if (pr.checksStatus === "fail") return "FAILING_CHECKS";
  if (pr.reviewRequired) return "WAITING_REVIEW";
  if (pr.checksStatus === "pass" && pr.mergeableState === "clean") return "MERGEABLE_NOW";
  return "UNKNOWN";
}

function deriveMergeReadiness(prs: AttentionPrSummary[]): MergeReadiness {
  const openPrs = prs.filter((pr) => pr.state === "open" && !pr.merged);
  if (openPrs.length === 0) {
    return "UNKNOWN";
  }

  const readinessOrder: Record<MergeReadiness, number> = {
    CONFLICT: 0,
    FAILING_CHECKS: 1,
    WAITING_REVIEW: 2,
    UNKNOWN: 3,
    MERGEABLE_NOW: 4,
  };

  return openPrs
    .map(derivePrMergeReadiness)
    .sort((a, b) => readinessOrder[a] - readinessOrder[b])[0];
}

function attentionExistsClauses(ticket: typeof schema.tickets) {
  const hasPendingChange = sql<boolean>`
    exists (
      select 1
      from ${schema.pendingChanges} pc
      where pc.repo_full_name = ${ticket.repoFullName}
        and pc.ticket_id = ${ticket.id}
        and pc.status <> 'merged'
        and pc.status <> 'closed'
    )
  `;

  const hasOpenPr = sql<boolean>`
    exists (
      select 1
      from ${schema.ticketPrs} tp
      where tp.repo_full_name = ${ticket.repoFullName}
        and tp.ticket_id = ${ticket.id}
        and tp.state = 'open'
        and coalesce(tp.merged, false) = false
    )
  `;

  const hasCiFailing = sql<boolean>`
    exists (
      select 1
      from ${schema.ticketPrs} tp
      where tp.repo_full_name = ${ticket.repoFullName}
        and tp.ticket_id = ${ticket.id}
        and tp.checks_state = 'fail'
    )
  `;

  return { hasPendingChange, hasOpenPr, hasCiFailing };
}

function buildRepoTicketFilter(
  repoTicketIds: Map<string, string[]>,
  repoColumn: typeof schema.ticketPrs.repoFullName | typeof schema.pendingChanges.repoFullName,
  ticketColumn: typeof schema.ticketPrs.ticketId | typeof schema.pendingChanges.ticketId,
) {
  const clauses = Array.from(repoTicketIds.entries())
    .filter(([, ids]) => ids.length > 0)
    .map(([repoFullName, ids]) => and(eq(repoColumn, repoFullName), inArray(ticketColumn, ids)));

  if (clauses.length === 0) {
    return undefined;
  }
  if (clauses.length === 1) {
    return clauses[0];
  }

  return or(...clauses);
}

/**
 * GET /api/space/attention
 *
 * Returns attention-worthy tickets across all enabled repos.
 * Reads from Postgres cache only — zero GitHub API calls.
 *
 * Attention criteria (any = include):
 *  - pending ticket-change PR exists
 *  - open PR linked to ticket (waiting review)
 *  - CI failing on linked PR
 *  - ticket state is blocked
 *  - ticket in_progress stale (>24h since cachedAt)
 *
 * Query param ?repos=owner/repo,owner/repo2 to filter to specific repos.
 */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireSession();

  // Parse optional repo filter
  const { searchParams } = new URL(req.url);
  const repoFilter = searchParams.get("repos");
  const filterSet = repoFilter
    ? new Set(repoFilter.split(",").map((r) => r.trim()).filter(Boolean))
    : null;

  // Get user's installation IDs
  const userInstalls = await db.query.userInstallations.findMany({
    where: eq(schema.userInstallations.userId, userId),
  });

  if (userInstalls.length === 0) {
    return apiSuccess({
      items: [],
      repos: [],
      totals: {
        reposEnabled: 0,
        reposSelected: 0,
        ticketsTotal: 0,
        ticketsAttention: 0,
      },
      reasonCatalog: getReasonCatalog(),
      loadedAt: new Date().toISOString(),
    } satisfies AttentionResponse);
  }

  const installationIds = userInstalls.map((ui) => ui.installationId);

  // Get enabled repos for this user
  const repos = await db.query.repos.findMany({
    where: and(
      eq(schema.repos.enabled, true),
      inArray(schema.repos.installationId, installationIds),
    ),
  });

  // Apply repo filter if provided
  if (filterSet) {
    assertNoUnauthorizedRepos(filterSet, repos.map((repo) => repo.fullName));
  }
  const targetRepos = filterSet
    ? repos.filter((r) => filterSet.has(r.fullName))
    : repos;

  if (targetRepos.length === 0) {
    const enabledRepos: EnabledRepoSummary[] = repos.map((r) => ({
      fullName: r.fullName,
      owner: r.owner,
      repo: r.repo,
      totalTickets: 0,
      attentionTickets: 0,
    }));

    return apiSuccess({
      items: [],
      repos: enabledRepos,
      totals: {
        reposEnabled: repos.length,
        reposSelected: 0,
        ticketsTotal: 0,
        ticketsAttention: 0,
      },
      reasonCatalog: getReasonCatalog(),
      loadedAt: new Date().toISOString(),
    } satisfies AttentionResponse);
  }

  const repoFullNames = targetRepos.map((r) => r.fullName);
  const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS);

  const { hasPendingChange, hasOpenPr, hasCiFailing } = attentionExistsClauses(schema.tickets);

  const [repoTicketCounts, attentionTickets] = await Promise.all([
    db.select({
      repoFullName: schema.tickets.repoFullName,
      total: sql<number>`count(*)`,
    })
      .from(schema.tickets)
      .where(inArray(schema.tickets.repoFullName, repoFullNames))
      .groupBy(schema.tickets.repoFullName),
    db.select({
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
      hasPendingChange,
      hasOpenPr,
      hasCiFailing,
    })
      .from(schema.tickets)
      .where(and(
        inArray(schema.tickets.repoFullName, repoFullNames),
        or(
          eq(schema.tickets.state, "blocked"),
          and(eq(schema.tickets.state, "in_progress"), lt(schema.tickets.cachedAt, staleThreshold)),
          hasPendingChange,
          hasOpenPr,
          hasCiFailing,
        ),
      )),
  ]);
  const typedRepoTicketCounts = repoTicketCounts as unknown as RepoTicketCountRow[];
  const typedAttentionTickets = attentionTickets as unknown as AttentionTicketRow[];

  const repoTicketIds = new Map<string, string[]>();
  for (const ticket of typedAttentionTickets) {
    const repoIds = repoTicketIds.get(ticket.repoFullName) ?? [];
    repoIds.push(ticket.id);
    repoTicketIds.set(ticket.repoFullName, repoIds);
  }

  const ticketPrFilter = buildRepoTicketFilter(
    repoTicketIds,
    schema.ticketPrs.repoFullName,
    schema.ticketPrs.ticketId,
  );
  const pendingFilter = buildRepoTicketFilter(
    repoTicketIds,
    schema.pendingChanges.repoFullName,
    schema.pendingChanges.ticketId,
  );

  const [prs, pending] = await Promise.all([
    ticketPrFilter ? db.query.ticketPrs.findMany({ where: ticketPrFilter }) : Promise.resolve([]),
    pendingFilter ? db.query.pendingChanges.findMany({
      where: and(
        pendingFilter,
        ne(schema.pendingChanges.status, "merged"),
        ne(schema.pendingChanges.status, "closed"),
      ),
    }) : Promise.resolve([]),
  ]);

  // Build pending changes lookup:
  // - repoFullName:ticketId -> has pending change
  // - repoFullName:prNumber -> review required state
  const pendingTicketSet = new Set<string>();
  const waitingReviewPrSet = new Set<string>();
  for (const pc of pending) {
    pendingTicketSet.add(`${pc.repoFullName}:${pc.ticketId}`);
    if (pc.status === "waiting_review") {
      waitingReviewPrSet.add(`${pc.repoFullName}:${pc.prNumber}`);
    }
  }

  // Build PR lookup: repoFullName:shortId → prs
  const prsByTicketId = new Map<string, AttentionPrSummary[]>();
  for (const pr of prs) {
    const repoFullName = pr.repoFullName;
    const ciStatus = checksStatusToCiStatus(pr.checksState);

    const summary: AttentionPrSummary = {
      prNumber: pr.prNumber,
      url: pr.prUrl,
      title: pr.title ?? null,
      state: pr.state ?? null,
      merged: pr.merged ?? null,
      mergeableState: pr.mergeableState ?? null,
      checksStatus: pr.checksState,
      reviewRequired: waitingReviewPrSet.has(`${repoFullName}:${pr.prNumber}`),
      ciStatus,
    };

    const key = ticketLookupKey(repoFullName, pr.ticketId);
    const existing = prsByTicketId.get(key) ?? [];
    existing.push(summary);
    prsByTicketId.set(key, existing);
  }

  // Process tickets and determine attention
  const items: AttentionItem[] = [];
  const totalByRepo = new Map<string, number>(
    typedRepoTicketCounts.map((row) => [row.repoFullName, Number(row.total)]),
  );
  const attentionByRepo = new Map<string, number>();

  for (const ticket of typedAttentionTickets) {
    const ticketPrs = prsByTicketId.get(ticketLookupKey(ticket.repoFullName, ticket.id)) ?? [];
    const hasPendingChange = ticket.hasPendingChange || pendingTicketSet.has(ticketLookupKey(ticket.repoFullName, ticket.id));
    const mergeReadiness = deriveMergeReadiness(ticketPrs);

    const reasons: AttentionReason[] = [];

    // Condition 1: pending ticket-change PR
    if (hasPendingChange) {
      reasons.push("pending_pr");
    }

    // Condition 2: open PR linked → waiting review
    const hasOpenPr = ticket.hasOpenPr || ticketPrs.some((pr) => pr.state === "open" && !pr.merged);
    if (hasOpenPr) {
      reasons.push("pr_waiting_review");
    }

    // Condition 3: CI failing on linked PR
    const hasCiFailing = ticket.hasCiFailing || ticketPrs.some((pr) => pr.ciStatus === "failure");
    if (hasCiFailing) {
      reasons.push("ci_failing");
    }

    // Condition 4: ticket state is blocked
    if (ticket.state === "blocked") {
      reasons.push("blocked");
    }

    // Condition 5: in_progress stale (>24h since last cache update)
    if (ticket.state === "in_progress") {
      if (ticket.cachedAt < staleThreshold) {
        reasons.push("stale_in_progress");
      }
    }

    if (reasons.length === 0) {
      continue;
    }
    const reasonDetails = toReasonDetails(reasons);
    const orderedReasons = reasonDetails.map((reason) => reason.code);

    attentionByRepo.set(ticket.repoFullName, (attentionByRepo.get(ticket.repoFullName) ?? 0) + 1);

    items.push({
      repoFullName: ticket.repoFullName,
      ticketId: ticket.id,
      shortId: ticket.shortId,
      displayId: ticket.displayId,
      title: ticket.title,
      state: ticket.state,
      priority: ticket.priority,
      labels: (ticket.labels as string[]) ?? [],
      path: ticket.path,
      assignee: ticket.assignee,
      reviewer: ticket.reviewer,
      createdAt: ticket.createdAt?.toISOString() ?? null,
      cachedAt: ticket.cachedAt.toISOString(),
      reasons: orderedReasons,
      reasonDetails,
      primaryReason: orderedReasons[0],
      prs: ticketPrs,
      mergeReadiness,
      hasPendingChange,
    });
  }

  // Sort: blocked first, then stale_in_progress, then priority, then age
  items.sort(compareAttentionItems);

  const enabledRepos: EnabledRepoSummary[] = repos.map((r) => ({
    fullName: r.fullName,
    owner: r.owner,
    repo: r.repo,
    totalTickets: totalByRepo.get(r.fullName) ?? 0,
    attentionTickets: attentionByRepo.get(r.fullName) ?? 0,
  }));

    return apiSuccess({
      items,
      repos: enabledRepos,
      totals: {
        reposEnabled: repos.length,
        reposSelected: targetRepos.length,
        ticketsTotal: Array.from(totalByRepo.values()).reduce((sum, value) => sum + value, 0),
        ticketsAttention: items.length,
      },
      reasonCatalog: getReasonCatalog(),
      loadedAt: new Date().toISOString(),
    } satisfies AttentionResponse);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error("[/api/space/attention] Error:", error);
    return apiSuccess({
      items: [],
      repos: [],
      totals: {
        reposEnabled: 0,
        reposSelected: 0,
        ticketsTotal: 0,
        ticketsAttention: 0,
      },
      reasonCatalog: getReasonCatalog(),
      loadedAt: new Date().toISOString(),
    } satisfies AttentionResponse);
  }
}
