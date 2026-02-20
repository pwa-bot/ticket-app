import type { Ticket, TicketFrontmatter, TicketIndex } from "@ticketdotapp/core";
import matter from "gray-matter";

const GITHUB_API_BASE = "https://api.github.com";
const PR_CACHE_TTL_MS = 5 * 60 * 1000;
const INDEX_CACHE_TTL_MS = 60 * 1000;

const prLookupCache = new Map<string, { expiresAt: number; value: LinkedPullRequest[] }>();
const ticketIndexCache = new Map<string, { expiresAt: number; value: TicketIndex }>();

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

interface GithubPullApi {
  id: number;
  number: number;
  title: string;
  state: string;
  html_url: string;
  head: {
    ref: string;
  };
}

interface GithubIssueSearchItemApi {
  id: number;
  number: number;
  title: string;
  state: string;
  html_url: string;
}

interface GithubIssueSearchResponseApi {
  items: GithubIssueSearchItemApi[];
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
  try {
    const response = await fetch(`${GITHUB_API_BASE}/repos/${fullName}/contents/.tickets/index.json`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    });

    const hasTickets = response.ok;
    console.log(`[repoHasTickets] ${fullName}: ${response.status} -> ${hasTickets}`);
    return hasTickets;
  } catch (error) {
    console.error(`[repoHasTickets] ${fullName}: error`, error);
    return false;
  }
}

export async function listReposWithTickets(token: string): Promise<RepoSummary[]> {
  const repos = await githubFetch<GithubRepoApi[]>("/user/repos?sort=updated&per_page=100", token);
  
  console.log(`[listReposWithTickets] Found ${repos.length} repos: ${repos.map(r => r.full_name).join(', ')}`);
  
  // Check repos in batches of 10 to avoid GitHub secondary rate limits
  const results: { repo: GithubRepoApi; hasTickets: boolean }[] = [];
  const batchSize = 10;
  
  for (let i = 0; i < repos.length; i += batchSize) {
    const batch = repos.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (repo) => ({
        repo,
        hasTickets: await repoHasTickets(token, repo.full_name),
      })),
    );
    results.push(...batchResults);
  }

  const withTickets = results.filter((entry) => entry.hasTickets);
  console.log(`[listReposWithTickets] Repos with .tickets/: ${withTickets.map(e => e.repo.full_name).join(', ')}`);
  
  return withTickets.map(({ repo }) => ({
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
  const cached = ticketIndexCache.get(repo);
  if (cached && Date.now() <= cached.expiresAt) {
    return cached.value;
  }

  const payload = await githubFetch<GithubContentApi>(`/repos/${repo}/contents/.tickets/index.json`, token);
  const parsed = JSON.parse(decodeGithubFile(payload)) as TicketIndex;
  ticketIndexCache.set(repo, { expiresAt: Date.now() + INDEX_CACHE_TTL_MS, value: parsed });
  return parsed;
}

export function clearTicketIndexCache(repo?: string) {
  if (repo) {
    ticketIndexCache.delete(repo);
    return;
  }

  ticketIndexCache.clear();
}

export interface TicketDetailResponse {
  id: string;
  display_id: string;
  repo: string;
  path: string;
  html_url: string | null;
  frontmatter: Record<string, unknown>;
  body: string;
  linked_prs: LinkedPullRequest[];
}

export interface LinkedPullRequest {
  id: number;
  number: number;
  title: string;
  state: string;
  html_url: string;
}

function getCachedLinkedPullRequests(cacheKey: string): LinkedPullRequest[] | null {
  const cached = prLookupCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (Date.now() > cached.expiresAt) {
    prLookupCache.delete(cacheKey);
    return null;
  }

  return cached.value;
}

function setCachedLinkedPullRequests(cacheKey: string, value: LinkedPullRequest[]) {
  prLookupCache.set(cacheKey, { expiresAt: Date.now() + PR_CACHE_TTL_MS, value });
}

async function getLinkedPullRequests(token: string, repo: string, id: string): Promise<LinkedPullRequest[]> {
  const cacheKey = `${repo}:${id}`;
  const cached = getCachedLinkedPullRequests(cacheKey);
  if (cached) {
    return cached;
  }

  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    return [];
  }

  const shortId = id.slice(0, 8).toUpperCase();
  const branchNeedle = `tk-${shortId.toLowerCase()}`;

  const [pullsResult, searchResult] = await Promise.allSettled([
    githubFetch<GithubPullApi[]>(`/repos/${owner}/${name}/pulls?state=all&per_page=100`, token),
    githubFetch<GithubIssueSearchResponseApi>(
      `/search/issues?q=${encodeURIComponent(`repo:${owner}/${name} type:pr TK-${shortId} in:title`)}`,
      token,
    ),
  ]);

  const linkedById = new Map<number, LinkedPullRequest>();

  if (pullsResult.status === "fulfilled") {
    pullsResult.value
      .filter((pull) => pull.head.ref.toLowerCase().includes(branchNeedle))
      .forEach((pull) => {
        linkedById.set(pull.id, {
          id: pull.id,
          number: pull.number,
          title: pull.title,
          state: pull.state,
          html_url: pull.html_url,
        });
      });
  }

  if (searchResult.status === "fulfilled") {
    searchResult.value.items.forEach((item) => {
      linkedById.set(item.id, {
        id: item.id,
        number: item.number,
        title: item.title,
        state: item.state,
        html_url: item.html_url,
      });
    });
  }

  const linked = Array.from(linkedById.values()).sort((a, b) => b.number - a.number);
  setCachedLinkedPullRequests(cacheKey, linked);
  return linked;
}

export async function getTicketById(token: string, repo: string, id: string): Promise<TicketDetailResponse> {
  const path = `.tickets/tickets/${id}.md`;
  const payload = await githubFetch<GithubContentApi>(`/repos/${repo}/contents/${path}`, token);
  const markdown = decodeGithubFile(payload);
  const parsed = matter(markdown);
  const linkedPullRequests = await getLinkedPullRequests(token, repo, id);

  const frontmatter = parsed.data as Record<string, unknown>;
  const ticketLike: Partial<Ticket> = {
    id,
    body: parsed.content,
    ...(frontmatter as Partial<TicketFrontmatter>),
  };

  const ticketId = ticketLike.id ?? id;

  return {
    id: ticketId,
    display_id: `TK-${ticketId.slice(0, 8)}`,
    repo,
    path,
    html_url: payload.html_url ?? null,
    frontmatter,
    body: ticketLike.body ?? "",
    linked_prs: linkedPullRequests,
  };
}
