import { NextRequest } from "next/server";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { apiError, apiSuccess } from "@/lib/api/response";
import { requireSession } from "@/lib/auth";
import { hydrateInstallationRepos } from "@/lib/github/hydrate-installation-repos";

interface GithubInstallation {
  id: number;
  account: { login: string; type: string } | null;
}

const INSTALLATION_REHYDRATE_TTL_MS = 10 * 60 * 1000;
const MAX_STALE_INSTALLATION_REHYDRATES_PER_REQUEST = 1;

function shouldRefresh(request: NextRequest): boolean {
  const value = request.nextUrl.searchParams.get("refresh");
  return value === "1" || value === "true";
}

async function syncUserInstallationsFromGithub(userId: string, token: string): Promise<void> {
  const response = await fetch("https://api.github.com/user/installations", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub installations sync failed: ${response.status}`);
  }

  const data = (await response.json()) as { installations: GithubInstallation[] };

  for (const inst of data.installations) {
    const accountLogin = inst.account?.login ?? "unknown";
    const accountType = inst.account?.type ?? "User";

    const existingInstallation = await db.query.installations.findFirst({
      where: eq(schema.installations.githubInstallationId, inst.id),
    });

    let installationDbId: number;

    if (existingInstallation) {
      installationDbId = existingInstallation.id;
      await db
        .update(schema.installations)
        .set({
          githubAccountLogin: accountLogin,
          githubAccountType: accountType,
          updatedAt: new Date(),
        })
        .where(eq(schema.installations.id, existingInstallation.id));
    } else {
      const [inserted] = await db
        .insert(schema.installations)
        .values({
          githubInstallationId: inst.id,
          githubAccountLogin: accountLogin,
          githubAccountType: accountType,
        })
        .returning({ id: schema.installations.id });
      installationDbId = inserted.id;
    }

    await db
      .insert(schema.userInstallations)
      .values({ userId, installationId: installationDbId })
      .onConflictDoNothing();
  }
}

/**
 * GET /api/repos
 *
 * Default behavior is cache-first (fast path): returns repos from Postgres cache.
 *
 * Optional refresh mode (`?refresh=1`) performs GitHub installation sync before
 * listing repos, then force-hydrates repos for each installation.
 *
 * Without refresh, hydration is lazy and only runs for installations that currently
 * have zero cached repos, plus at most one stale installation (TTL-based) to avoid
 * long-lived stale repo lists.
 */
export async function GET(request: NextRequest) {
  const { userId, token } = await requireSession();
  const refresh = shouldRefresh(request);

  try {
    if (refresh) {
      await syncUserInstallationsFromGithub(userId, token);
    }

    const userInstallations = await db.query.userInstallations.findMany({
      where: eq(schema.userInstallations.userId, userId),
    });

    if (userInstallations.length === 0) {
      return apiSuccess({ repos: [] });
    }

    const installationIds = userInstallations.map((ui) => ui.installationId);

    // Self-heal legacy installation-id drift: if installation IDs rotated but owner login is unchanged,
    // relink owner-matching repos to the user's current installation IDs.
    const installations = await db.query.installations.findMany({
      where: inArray(schema.installations.id, installationIds),
    });
    for (const installation of installations) {
      const ownerLogin = installation.githubAccountLogin?.trim();
      if (!ownerLogin) continue;
      await db
        .update(schema.repos)
        .set({ installationId: installation.id, updatedAt: new Date() })
        .where(and(eq(schema.repos.owner, ownerLogin), ne(schema.repos.installationId, installation.id)));
    }

    let repos = await db.query.repos.findMany({
      where: inArray(schema.repos.installationId, installationIds),
    });

    const reposByInstallation = new Map<number, typeof repos>();
    for (const repo of repos) {
      if (typeof repo.installationId !== "number") continue;
      const current = reposByInstallation.get(repo.installationId) ?? [];
      current.push(repo);
      reposByInstallation.set(repo.installationId, current);
    }

    const now = Date.now();
    const staleInstallations = installationIds
      .filter((id) => (reposByInstallation.get(id)?.length ?? 0) > 0)
      .filter((id) => {
        const newestUpdatedAt = reposByInstallation
          .get(id)
          ?.reduce<number>((latest, repo) => {
            const updated = repo.updatedAt?.getTime() ?? 0;
            return updated > latest ? updated : latest;
          }, 0) ?? 0;

        if (!newestUpdatedAt) return true;
        return now - newestUpdatedAt > INSTALLATION_REHYDRATE_TTL_MS;
      })
      .slice(0, MAX_STALE_INSTALLATION_REHYDRATES_PER_REQUEST);

    const installationsToHydrate = refresh
      ? installationIds
      : [
          ...installationIds.filter((id) => (reposByInstallation.get(id)?.length ?? 0) === 0),
          ...staleInstallations,
        ];

    if (installationsToHydrate.length > 0) {
      for (const installationDbId of installationsToHydrate) {
        const installation = await db.query.installations.findFirst({
          where: eq(schema.installations.id, installationDbId),
        });

        if (!installation) {
          continue;
        }

        try {
          const result = await hydrateInstallationRepos(installationDbId, installation.githubInstallationId, token);
          console.info("[/api/repos] hydrated installation", {
            installationDbId,
            githubInstallationId: installation.githubInstallationId,
            hydratedRepoCount: result.hydratedRepoCount,
            pagesFetched: result.pagesFetched,
            totalCountHint: result.totalCountHint,
            reason: refresh ? "forced_refresh" : "stale_or_empty_cache",
          });
        } catch (error) {
          console.error("[/api/repos] hydration failed for installation", installation.githubInstallationId, error);
        }
      }

      repos = await db.query.repos.findMany({
        where: inArray(schema.repos.installationId, installationIds),
      });
    }

    return apiSuccess({
      repos: repos.map((r) => ({
        full_name: r.fullName,
        name: r.repo,
        owner: r.owner,
        enabled: r.enabled,
        defaultBranch: r.defaultBranch,
      })),
    });
  } catch (error) {
    console.error("[/api/repos] Error loading repositories:", error);
    return apiError("Failed to load repositories", { status: 500 });
  }
}
