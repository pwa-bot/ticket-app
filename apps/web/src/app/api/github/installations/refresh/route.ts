import { eq } from "drizzle-orm";
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

async function hydrateReposForInstallation(installationDbId: number, githubInstallationId: number, token: string): Promise<number> {
  let hydrated = 0;
  let page = 1;

  while (true) {
    const reposResponse = await fetch(
      `https://api.github.com/user/installations/${githubInstallationId}/repositories?per_page=100&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    if (!reposResponse.ok) {
      throw new Error(`GitHub repositories API error: ${reposResponse.status}`);
    }

    const reposData = (await reposResponse.json()) as { repositories: GithubRepo[] };

    for (const ghRepo of reposData.repositories) {
      const fullName = ghRepo.full_name;
      const existing = await db.query.repos.findFirst({
        where: eq(schema.repos.fullName, fullName),
      });

      if (!existing) {
        await db.insert(schema.repos).values({
          id: crypto.randomUUID(),
          installationId: installationDbId,
          owner: ghRepo.owner.login,
          repo: ghRepo.name,
          fullName,
          defaultBranch: ghRepo.default_branch ?? "main",
          enabled: false,
        });
      } else {
        await db
          .update(schema.repos)
          .set({
            installationId: installationDbId,
            owner: ghRepo.owner.login,
            repo: ghRepo.name,
            defaultBranch: ghRepo.default_branch ?? existing.defaultBranch,
            updatedAt: new Date(),
          })
          .where(eq(schema.repos.id, existing.id));
      }

      hydrated += 1;
    }

    if (reposData.repositories.length < 100) {
      break;
    }

    page += 1;
  }

  return hydrated;
}

/**
 * POST /api/github/installations/refresh
 *
 * Re-fetches the current user's GitHub App installations using their OAuth token.
 * Works with read:user scope — calls GET /user/installations.
 *
 * Also force-hydrates repository cache for each installation so newly-installed
 * personal repos become visible immediately in /api/repos.
 */
export async function POST() {
  const { userId, token } = await requireSession();

  try {
    const response = await fetch("https://api.github.com/user/installations", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("[refresh installations] GitHub API error:", response.status, text);
      return apiError(`GitHub API error: ${response.status}`, { status: 502 });
    }

    const data = (await response.json()) as { installations: GithubInstallation[] };

    const registered = [];
    let hydratedRepoCount = 0;

    for (const inst of data.installations) {
      const account = inst.account;
      const accountLogin = account?.login ?? "unknown";
      const accountType = account?.type ?? "User";

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

      try {
        hydratedRepoCount += await hydrateReposForInstallation(installationDbId, inst.id, token);
      } catch (error) {
        console.error("[refresh installations] repo hydration failed for", inst.id, error);
      }

      registered.push({ installationId: inst.id, accountLogin, accountType });
    }

    return apiSuccess({
      installations: registered,
      count: registered.length,
      hydratedRepoCount,
    });
  } catch (error) {
    console.error("[refresh installations] Error:", error);
    return apiError(error instanceof Error ? error.message : "Unknown error", { status: 500 });
  }
}
