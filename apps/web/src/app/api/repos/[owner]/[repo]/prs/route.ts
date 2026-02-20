import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import type { CiStatus } from "@/lib/attention";
import { requireRepoAccess } from "@/lib/security/repo-access";

interface Params {
  params: Promise<{ owner: string; repo: string }>;
}

interface LinkedPr {
  number: number;
  title: string;
  state: string;
  html_url: string;
  checks: CiStatus;
}

interface TicketPrEntry {
  ticketId: string;
  prs: LinkedPr[];
}

function checksToCi(status: string): CiStatus {
  if (status === "pass") return "success";
  if (status === "fail") return "failure";
  if (status === "running") return "pending";
  return "unknown";
}

export async function GET(_request: Request, { params }: Params) {
  const { owner, repo } = await params;
  const { fullName: fullRepo } = await requireRepoAccess(owner, repo);

  const rows = await db.query.ticketPrs.findMany({
    where: eq(schema.ticketPrs.repoFullName, fullRepo),
  });

  const grouped = new Map<string, LinkedPr[]>();
  for (const row of rows) {
    const existing = grouped.get(row.ticketId) ?? [];
    existing.push({
      number: row.prNumber,
      title: row.title ?? "",
      state: row.state ?? "open",
      html_url: row.prUrl,
      checks: checksToCi(row.checksState),
    });
    grouped.set(row.ticketId, existing);
  }

  const entries: TicketPrEntry[] = Array.from(grouped.entries()).map(([ticketId, prs]) => ({
    ticketId,
    prs: prs.sort((a, b) => b.number - a.number),
  }));

  return NextResponse.json(entries);
}
