import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { apiError, apiSuccess } from "@/lib/api/response";
import { requireSession } from "@/lib/auth";
import { hydrateInstallationRepos } from "@/lib/github/hydrate-installation-repos";

interface GithubInstallation {
  id: number;
  account: { login: string; type: string } | null;
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
        const result = await hydrateInstallationRepos(installationDbId, inst.id, token);
        hydratedRepoCount += result.hydratedRepoCount;
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
