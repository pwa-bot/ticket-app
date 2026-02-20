import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";

interface GithubRepo {
  name: string;
  full_name: string;
  default_branch: string | null;
  owner: { login: string };
}

interface GithubInstallationReposResponse {
  total_count?: number;
  repositories: GithubRepo[];
}

export interface HydrateInstallationReposResult {
  hydratedRepoCount: number;
  pagesFetched: number;
  totalCountHint: number | null;
}

export async function hydrateInstallationRepos(
  installationDbId: number,
  githubInstallationId: number,
  token: string,
): Promise<HydrateInstallationReposResult> {
  let hydratedRepoCount = 0;
  let page = 1;
  let pagesFetched = 0;
  let totalCountHint: number | null = null;

  while (true) {
    const response = await fetch(
      `https://api.github.com/user/installations/${githubInstallationId}/repositories?per_page=100&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      },
    );

    if (!response.ok) {
      throw new Error(`GitHub repo hydration failed: ${response.status}`);
    }

    const data = (await response.json()) as GithubInstallationReposResponse;
    pagesFetched += 1;
    if (typeof data.total_count === "number") {
      totalCountHint = data.total_count;
    }

    for (const ghRepo of data.repositories) {
      const fullName = ghRepo.full_name;

      await db
        .insert(schema.repos)
        .values({
          id: crypto.randomUUID(),
          installationId: installationDbId,
          owner: ghRepo.owner.login,
          repo: ghRepo.name,
          fullName,
          defaultBranch: ghRepo.default_branch ?? "main",
          enabled: false,
        })
        .onConflictDoUpdate({
          target: schema.repos.fullName,
          set: {
            installationId: installationDbId,
            owner: ghRepo.owner.login,
            repo: ghRepo.name,
            defaultBranch: ghRepo.default_branch ?? "main",
            updatedAt: new Date(),
          },
        });

      hydratedRepoCount += 1;
    }

    if (data.repositories.length < 100) {
      break;
    }

    page += 1;
  }

  await db
    .update(schema.installations)
    .set({ updatedAt: new Date() })
    .where(eq(schema.installations.id, installationDbId));

  return { hydratedRepoCount, pagesFetched, totalCountHint };
}
