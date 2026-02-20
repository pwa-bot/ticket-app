import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { apiError } from "@/lib/api/response";
import { requireSession, type SessionData } from "@/lib/auth";

interface AccessibleRepoFilter {
  userId: string;
  enabledOnly?: boolean;
}

export interface AccessibleRepo {
  fullName: string;
  owner: string;
  repo: string;
  installationId: number | null;
  enabled: boolean;
}

export async function listAccessibleRepos({
  userId,
  enabledOnly = false,
}: AccessibleRepoFilter): Promise<AccessibleRepo[]> {
  const userInstallations = await db.query.userInstallations.findMany({
    where: eq(schema.userInstallations.userId, userId),
  });

  const installationIds = userInstallations.map((entry) => entry.installationId);

  if (installationIds.length === 0) {
    return [];
  }

  const where = enabledOnly
    ? and(eq(schema.repos.enabled, true), inArray(schema.repos.installationId, installationIds))
    : inArray(schema.repos.installationId, installationIds);

  const repos = await db.query.repos.findMany({ where });

  return repos.map((repo) => ({
    fullName: repo.fullName,
    owner: repo.owner,
    repo: repo.repo,
    installationId: repo.installationId ?? null,
    enabled: repo.enabled,
  }));
}

export async function listAccessibleRepoFullNames({ userId, enabledOnly = false }: AccessibleRepoFilter): Promise<string[]> {
  const repos = await listAccessibleRepos({ userId, enabledOnly });
  return repos.map((repo) => repo.fullName);
}

export function findUnauthorizedRepos(requested: Set<string>, accessible: Iterable<string>): string[] {
  const accessibleSet = new Set(accessible);
  return [...requested].filter((repo) => !accessibleSet.has(repo));
}

export function assertNoUnauthorizedRepos(requested: Set<string>, accessible: Iterable<string>): void {
  const unauthorized = findUnauthorizedRepos(requested, accessible);

  if (unauthorized.length > 0) {
    throw apiError("Forbidden", { status: 403, legacy: { repos: unauthorized } });
  }
}

export async function hasRepoAccess(userId: string, fullName: string): Promise<boolean> {
  const repo = await db.query.repos.findFirst({ where: eq(schema.repos.fullName, fullName) });
  if (!repo || !repo.installationId) {
    return false;
  }

  const userInstallation = await db.query.userInstallations.findFirst({
    where: and(
      eq(schema.userInstallations.userId, userId),
      eq(schema.userInstallations.installationId, repo.installationId),
    ),
  });

  return Boolean(userInstallation);
}

export async function requireRepoAccess(owner: string, repo: string): Promise<{ session: SessionData; fullName: string }> {
  const session = await requireSession();
  const fullName = `${owner}/${repo}`;

  const allowed = await hasRepoAccess(session.userId, fullName);
  if (!allowed) {
    throw apiError("Forbidden", { status: 403 });
  }

  return { session, fullName };
}
