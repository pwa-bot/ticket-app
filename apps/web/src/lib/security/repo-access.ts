import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { requireSession, type SessionData } from "@/lib/auth";

interface AccessibleRepoFilter {
  userId: string;
  enabledOnly?: boolean;
}

export async function listAccessibleRepoFullNames({ userId, enabledOnly = false }: AccessibleRepoFilter): Promise<string[]> {
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
  return repos.map((repo) => repo.fullName);
}

export function findUnauthorizedRepos(requested: Set<string>, accessible: Iterable<string>): string[] {
  const accessibleSet = new Set(accessible);
  return [...requested].filter((repo) => !accessibleSet.has(repo));
}

export function assertNoUnauthorizedRepos(requested: Set<string>, accessible: Iterable<string>): void {
  const unauthorized = findUnauthorizedRepos(requested, accessible);

  if (unauthorized.length > 0) {
    throw NextResponse.json({ error: "Forbidden", repos: unauthorized }, { status: 403 });
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
    throw NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return { session, fullName };
}
