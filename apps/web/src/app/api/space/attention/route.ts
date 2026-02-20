import { NextRequest, NextResponse } from "next/server";
import { eq, inArray, and, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireSession } from "@/lib/auth";
import type { CiStatus, MergeReadiness } from "@/lib/attention";
import { assertNoUnauthorizedRepos } from "@/lib/security/repo-access";

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

type AttentionReason = "pending_pr" | "pr_waiting_review" | "ci_failing" | "blocked" | "stale_in_progress";

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
  prs: AttentionPrSummary[];
  mergeReadiness: MergeReadiness;
  hasPendingChange: boolean;
}

export interface EnabledRepoSummary {
  fullName: string;
  owner: string;
  repo: string;
  totalTickets: number;
}

export interface AttentionResponse {
  items: AttentionItem[];
  repos: EnabledRepoSummary[];
  loadedAt: string;
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
    return NextResponse.json({ items: [], repos: [], loadedAt: new Date().toISOString() } satisfies AttentionResponse);
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

  const enabledRepoFullNames = repos.map((r) => r.fullName);
  const repoTicketCounts = enabledRepoFullNames.length > 0
    ? await db.select({
      repoFullName: schema.tickets.repoFullName,
      total: sql<number>`count(*)`,
    })
      .from(schema.tickets)
      .where(inArray(schema.tickets.repoFullName, enabledRepoFullNames))
      .groupBy(schema.tickets.repoFullName)
    : [];

  const ticketCountsByRepo = new Map(repoTicketCounts.map((row) => [row.repoFullName, Number(row.total)]));

  // Build enabled repo summaries for selector
  const enabledRepos: EnabledRepoSummary[] = repos.map((r) => ({
    fullName: r.fullName,
    owner: r.owner,
    repo: r.repo,
    totalTickets: ticketCountsByRepo.get(r.fullName) ?? 0,
  }));

  if (targetRepos.length === 0) {
    return NextResponse.json({
      items: [],
      repos: enabledRepos,
      loadedAt: new Date().toISOString(),
    } satisfies AttentionResponse);
  }

  const repoFullNames = targetRepos.map((r) => r.fullName);

  const now = Date.now();

  // Bulk query: tickets, PRs, checks, pending changes
  const [tickets, prs, pending] = await Promise.all([
    db.query.tickets.findMany({
      where: inArray(schema.tickets.repoFullName, repoFullNames),
    }),
    db.query.ticketPrs.findMany({
      where: inArray(schema.ticketPrs.repoFullName, repoFullNames),
    }),
    db.query.pendingChanges.findMany({
      where: and(
        inArray(schema.pendingChanges.repoFullName, repoFullNames),
        ne(schema.pendingChanges.status, "merged"),
        ne(schema.pendingChanges.status, "closed"),
      ),
    }),
  ]);

  // Build ticket lookup: repoFullName:ticketId → ticket
  const ticketByRepoAndId = new Map<string, (typeof tickets)[number]>();
  for (const ticket of tickets) {
    ticketByRepoAndId.set(ticketLookupKey(ticket.repoFullName, ticket.id), ticket);
  }

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
  const prsByShortId = new Map<string, AttentionPrSummary[]>();
  for (const pr of prs) {
    const repoFullName = pr.repoFullName;
    const ticket = ticketByRepoAndId.get(ticketLookupKey(repoFullName, pr.ticketId));
    if (!ticket) continue;
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

    const key = `${repoFullName}:${ticket.shortId}`;
    const existing = prsByShortId.get(key) ?? [];
    existing.push(summary);
    prsByShortId.set(key, existing);
  }

  // Process tickets and determine attention
  const items: AttentionItem[] = [];

  for (const ticket of tickets) {
    const ticketPrs = prsByShortId.get(`${ticket.repoFullName}:${ticket.shortId}`) ?? [];
    const hasPendingChange = pendingTicketSet.has(`${ticket.repoFullName}:${ticket.id}`);
    const mergeReadiness = deriveMergeReadiness(ticketPrs);

    const reasons: AttentionReason[] = [];

    // Condition 1: pending ticket-change PR
    if (hasPendingChange) {
      reasons.push("pending_pr");
    }

    // Condition 2: open PR linked → waiting review
    const hasOpenPr = ticketPrs.some((pr) => pr.state === "open" && !pr.merged);
    if (hasOpenPr) {
      reasons.push("pr_waiting_review");
    }

    // Condition 3: CI failing on linked PR
    const hasCiFailing = ticketPrs.some((pr) => pr.ciStatus === "failure");
    if (hasCiFailing) {
      reasons.push("ci_failing");
    }

    // Condition 4: ticket state is blocked
    if (ticket.state === "blocked") {
      reasons.push("blocked");
    }

    // Condition 5: in_progress stale (>24h since last cache update)
    if (ticket.state === "in_progress") {
      const cachedMs = ticket.cachedAt?.getTime() ?? 0;
      if (now - cachedMs > STALE_THRESHOLD_MS) {
        reasons.push("stale_in_progress");
      }
    }

    if (reasons.length === 0) {
      continue;
    }

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
      reasons,
      prs: ticketPrs,
      mergeReadiness,
      hasPendingChange,
    });
  }

  // Sort: blocked first, then stale_in_progress, then priority, then age
  const reasonOrder: Record<AttentionReason, number> = {
    blocked: 0,
    ci_failing: 1,
    stale_in_progress: 2,
    pr_waiting_review: 3,
    pending_pr: 4,
  };
  const priorityOrder: Record<string, number> = { p0: 0, p1: 1, p2: 2, p3: 3 };
  const mergeReadinessOrder: Record<MergeReadiness, number> = {
    CONFLICT: 0,
    FAILING_CHECKS: 1,
    WAITING_REVIEW: 2,
    UNKNOWN: 3,
    MERGEABLE_NOW: 4,
  };

  items.sort((a, b) => {
    const aReason = Math.min(...a.reasons.map((r) => reasonOrder[r]));
    const bReason = Math.min(...b.reasons.map((r) => reasonOrder[r]));
    if (aReason !== bReason) return aReason - bReason;

    const aReadiness = mergeReadinessOrder[a.mergeReadiness];
    const bReadiness = mergeReadinessOrder[b.mergeReadiness];
    if (aReadiness !== bReadiness) return aReadiness - bReadiness;

    const aPriority = priorityOrder[a.priority] ?? 99;
    const bPriority = priorityOrder[b.priority] ?? 99;
    if (aPriority !== bPriority) return aPriority - bPriority;

    return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
  });

  return NextResponse.json({
    items,
    repos: enabledRepos,
    loadedAt: new Date().toISOString(),
  } satisfies AttentionResponse);
}
