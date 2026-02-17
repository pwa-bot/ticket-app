import { NextResponse } from "next/server";
import { getAccessTokenFromCookies } from "@/lib/auth";
import { getTicketIndex } from "@/lib/github";
import type { CiStatus } from "@/lib/attention";

const GITHUB_API_BASE = "https://api.github.com";

interface Params {
  params: Promise<{ owner: string; repo: string }>;
}

interface GithubPullApi {
  number: number;
  title: string;
  state: string;
  html_url: string;
  body: string | null;
  head: {
    ref: string;
    sha: string;
  };
}

interface GithubCommitStatusApi {
  state: "success" | "pending" | "failure" | "error";
  statuses: Array<{ state: "success" | "pending" | "failure" | "error" }>;
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

async function githubFetch<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${response.status}: ${body}`);
  }

  return (await response.json()) as T;
}

function normalizeChecks(payload: GithubCommitStatusApi): CiStatus {
  const states = [payload.state, ...payload.statuses.map((status) => status.state)];
  if (states.some((state) => state === "failure" || state === "error")) {
    return "failure";
  }
  if (states.some((state) => state === "pending")) {
    return "pending";
  }
  if (states.some((state) => state === "success")) {
    return "success";
  }
  return "unknown";
}

function buildNeedles(ticketId: string, shortId: string, displayId: string): string[] {
  const normalizedShort = shortId.toLowerCase();
  return Array.from(
    new Set([
      ticketId.toLowerCase(),
      normalizedShort,
      `tk-${normalizedShort}`,
      displayId.toLowerCase(),
      displayId.toLowerCase().replace("tk-", ""),
    ]),
  );
}

function matchesTicket(pr: GithubPullApi, needles: string[]): boolean {
  const haystack = `${pr.head.ref} ${pr.title} ${pr.body ?? ""}`.toLowerCase();
  return needles.some((needle) => haystack.includes(needle));
}

export async function GET(_request: Request, { params }: Params) {
  const token = await getAccessTokenFromCookies();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { owner, repo } = await params;
  const fullRepo = `${owner}/${repo}`;

  try {
    const [pulls, index] = await Promise.all([
      githubFetch<GithubPullApi[]>(`/repos/${owner}/${repo}/pulls?state=open&per_page=100`, token),
      getTicketIndex(token, fullRepo),
    ]);

    const checkResults = await Promise.all(
      pulls.map(async (pr) => {
        try {
          const status = await githubFetch<GithubCommitStatusApi>(`/repos/${owner}/${repo}/commits/${pr.head.sha}/status`, token);
          return { number: pr.number, checks: normalizeChecks(status) };
        } catch {
          return { number: pr.number, checks: "unknown" as const };
        }
      }),
    );

    const checksByPr = new Map<number, CiStatus>(checkResults.map((entry) => [entry.number, entry.checks]));

    const entries: TicketPrEntry[] = index.tickets
      .map((ticket) => {
        const shortId = ticket.short_id || ticket.id.slice(0, 8);
        const displayId = ticket.display_id || `TK-${shortId.toUpperCase()}`;
        const needles = buildNeedles(ticket.id, shortId, displayId);

        const linked = pulls
          .filter((pr) => matchesTicket(pr, needles))
          .map((pr) => ({
            number: pr.number,
            title: pr.title,
            state: pr.state,
            html_url: pr.html_url,
            checks: checksByPr.get(pr.number) ?? "unknown",
          }))
          .sort((a, b) => b.number - a.number);

        return {
          ticketId: ticket.id,
          prs: linked,
        };
      })
      .filter((entry) => entry.prs.length > 0);

    return NextResponse.json(entries);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load PR links" },
      { status: 500 },
    );
  }
}
