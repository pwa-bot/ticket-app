import type { Ticket, TicketFrontmatter, TicketIndex } from "@/lib/types";
import matter from "gray-matter";

const GITHUB_API_BASE = "https://api.github.com";

export interface RepoSummary {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
}

interface GithubRepoApi {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
}

interface GithubContentApi {
  content?: string;
  encoding?: string;
  html_url?: string;
}

async function githubFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${response.status}: ${body}`);
  }

  return (await response.json()) as T;
}

async function repoHasTickets(token: string, fullName: string): Promise<boolean> {
  const response = await fetch(`${GITHUB_API_BASE}/repos/${fullName}/contents/.tickets/index.json`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });

  return response.ok;
}

export async function listReposWithTickets(token: string): Promise<RepoSummary[]> {
  const repos = await githubFetch<GithubRepoApi[]>("/user/repos?sort=updated&per_page=100", token);
  const checks = await Promise.all(
    repos.map(async (repo) => ({
      repo,
      hasTickets: await repoHasTickets(token, repo.full_name),
    })),
  );

  return checks
    .filter((entry) => entry.hasTickets)
    .map(({ repo }) => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      private: repo.private,
      html_url: repo.html_url,
    }));
}

function decodeGithubFile(content: GithubContentApi): string {
  if (content.encoding !== "base64" || !content.content) {
    throw new Error("Unexpected GitHub content payload");
  }

  return Buffer.from(content.content, "base64").toString("utf8");
}

export async function getTicketIndex(token: string, repo: string): Promise<TicketIndex> {
  const payload = await githubFetch<GithubContentApi>(`/repos/${repo}/contents/.tickets/index.json`, token);
  const parsed = JSON.parse(decodeGithubFile(payload)) as TicketIndex;
  return parsed;
}

export interface TicketDetailResponse {
  id: string;
  repo: string;
  path: string;
  html_url: string | null;
  frontmatter: Record<string, unknown>;
  body: string;
}

export async function getTicketById(token: string, repo: string, id: string): Promise<TicketDetailResponse> {
  const path = `.tickets/tickets/${id}.md`;
  const payload = await githubFetch<GithubContentApi>(`/repos/${repo}/contents/${path}`, token);
  const markdown = decodeGithubFile(payload);
  const parsed = matter(markdown);

  const frontmatter = parsed.data as Record<string, unknown>;
  const ticketLike: Partial<Ticket> = {
    id,
    body: parsed.content,
    ...(frontmatter as Partial<TicketFrontmatter>),
  };

  return {
    id: ticketLike.id ?? id,
    repo,
    path,
    html_url: payload.html_url ?? null,
    frontmatter,
    body: ticketLike.body ?? "",
  };
}
