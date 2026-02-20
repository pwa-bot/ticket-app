/**
 * GET /api/repos/:owner/:repo/ticket-prs
 *
 * Returns cached PRs linked to tickets from Postgres (no GitHub API calls).
 */

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { ApiEnvelope } from "@ticketdotapp/core";
import { db, schema } from "@/db/client";
import { requireRepoAccess } from "@/lib/security/repo-access";

type TicketPrInfo = {
  ticketId: string;
  prNumber: number;
  prUrl: string;
  prTitle: string;
  status:
    | "creating_pr"
    | "pending_checks"
    | "waiting_review"
    | "mergeable"
    | "auto_merge_enabled"
    | "merged"
    | "conflict"
    | "failed";
};

interface RouteParams {
  params: Promise<{ owner: string; repo: string }>;
}

type TicketPrsResponse = { prs: TicketPrInfo[] };

function mapStatus(row: {
  merged: boolean | null;
  mergeableState: string | null;
  checksState: string;
}): TicketPrInfo["status"] {
  if (row.merged) return "merged";
  if (row.mergeableState === "dirty") return "conflict";
  if (row.checksState === "fail") return "pending_checks";
  if (row.mergeableState === "blocked") return "waiting_review";
  if (row.mergeableState === "clean" && row.checksState === "pass") return "mergeable";
  return "pending_checks";
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { owner, repo } = await params;
  const { fullName } = await requireRepoAccess(owner, repo);

  const rows = await db.query.ticketPrs.findMany({
    where: eq(schema.ticketPrs.repoFullName, fullName),
  });

  const prs: TicketPrInfo[] = rows.map((row) => ({
    ticketId: row.ticketId,
    prNumber: row.prNumber,
    prUrl: row.prUrl,
    prTitle: row.title ?? "",
    status: mapStatus({
      merged: row.merged,
      mergeableState: row.mergeableState,
      checksState: row.checksState,
    }),
  }));

  const resp: ApiEnvelope<TicketPrsResponse> = { ok: true, data: { prs } };
  return NextResponse.json(resp);
}
