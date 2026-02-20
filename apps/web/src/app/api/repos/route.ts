import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { apiError, apiSuccess } from "@/lib/api/response";
import { requireSession } from "@/lib/auth";

/**
 * GET /api/repos
 *
 * Returns repos accessible to the current user via their GitHub App installations.
 * Uses Postgres cache only — no GitHub API calls required for repo listing.
 *
 * Before loading repos, we best-effort refresh the user's installation links from
 * GitHub to avoid stale mappings (e.g. newly-added personal installs not yet linked).
 */
export async function GET() {
  const { userId, token } = await requireSession();

  try {
    // Best-effort self-heal: refresh user->installation links from GitHub.
    // This ensures personal-account installs (e.g. pwabot) appear alongside org installs.
    try {
      const response = await fetch("https://api.github.com/user/installations", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      });

      if (response.ok) {
        const data = (await response.json()) as {
          installations: Array<{
            id: number;
            account: { login: string; type: string } | null;
          }>;
        };

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
    } catch {
      // Non-fatal: continue using cached local links.
    }

    // Get user's installation IDs
    const userInstallations = await db.query.userInstallations.findMany({
      where: eq(schema.userInstallations.userId, userId),
    });

    if (userInstallations.length === 0) {
      return apiSuccess({ repos: [] });
    }

    const installationIds = userInstallations.map((ui) => ui.installationId);

    // Get repos linked to user's installations
    const repos = await db.query.repos.findMany({
      where: inArray(schema.repos.installationId, installationIds),
    });

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
