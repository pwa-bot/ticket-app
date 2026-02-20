import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { apiError, apiSuccess } from "@/lib/api/response";
import { requireSession } from "@/lib/auth";

/**
 * GET /api/repos
 *
 * Returns repos accessible to the current user via their GitHub App installations.
 * Uses Postgres cache only — no GitHub API calls required.
 */
export async function GET() {
  const { userId } = await requireSession();

  try {
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
