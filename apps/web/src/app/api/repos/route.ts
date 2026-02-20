import { NextRequest } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { apiError, apiSuccess } from "@/lib/api/response";
import { requireSession } from "@/lib/auth";

interface GithubInstallation {
  id: number;
  account: { login: string; type: string } | null;
}

interface GithubRepo {
  name: string;
  full_name: string;
  default_branch: string | null;
  owner: { login: string };
}

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

async function hydrateReposForInstallation(installationDbId: number, githubInstallationId: number, token: string): Promise<void> {
  let page = 1;

  while (true) {
    const response = await fetch(
      `https://api.github.com/user/installations/${githubInstallationId}/repositories?per_page=100&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`GitHub repo hydration failed: ${response.status}`);
    }

    const data = (await response.json()) as { repositories: GithubRepo[] };

    for (const ghRepo of data.repositories) {
      const fullName = ghRepo.full_name;
      const existingRepo = await db.query.repos.findFirst({
        where: eq(schema.repos.fullName, fullName),
      });

      if (!existingRepo) {
        await db.insert(schema.repos).values({
          id: crypto.randomUUID(),
          installationId: installationDbId,
          owner: ghRepo.owner.login,
          repo: ghRepo.name,
          fullName,
          defaultBranch: ghRepo.default_branch ?? "main",
          enabled: false,
        });
        continue;
      }

      await db
        .update(schema.repos)
        .set({
          installationId: installationDbId,
          owner: ghRepo.owner.login,
          repo: ghRepo.name,
          defaultBranch: ghRepo.default_branch ?? existingRepo.defaultBranch,
          updatedAt: new Date(),
        })
        .where(eq(schema.repos.id, existingRepo.id));
    }

    if (data.repositories.length < 100) {
      break;
    }

    page += 1;
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
 * have zero cached repos. This keeps normal page loads fast while still self-healing
 * missing personal repos when first discovered.
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

    let repos = await db.query.repos.findMany({
      where: inArray(schema.repos.installationId, installationIds),
    });

    const installationsWithRepos = new Set(repos.map((repo) => repo.installationId).filter((id): id is number => typeof id === "number"));
    const installationsToHydrate = refresh
      ? installationIds
      : installationIds.filter((id) => !installationsWithRepos.has(id));

    if (installationsToHydrate.length > 0) {
      for (const installationDbId of installationsToHydrate) {
        const installation = await db.query.installations.findFirst({
          where: eq(schema.installations.id, installationDbId),
        });

        if (!installation) {
          continue;
        }

        try {
          await hydrateReposForInstallation(installationDbId, installation.githubInstallationId, token);
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
