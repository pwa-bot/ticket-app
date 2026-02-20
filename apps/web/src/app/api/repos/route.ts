import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { apiError, apiSuccess } from "@/lib/api/response";
import { requireSession } from "@/lib/auth";

/**
 * GET /api/repos
 *
 * Cache-only repository list for the current user's linked installations.
 *
 * Important: this endpoint intentionally performs ZERO GitHub API calls and
 * ZERO write operations. Explicit refresh/hydration belongs to:
 * - POST /api/github/installations/refresh
 * - webhook/jobs sync paths
 */
export async function GET() {
  const { userId } = await requireSession();

  try {
    const userInstallations = await db.query.userInstallations.findMany({
      where: eq(schema.userInstallations.userId, userId),
    });

    if (userInstallations.length === 0) {
      return apiSuccess({ repos: [] });
    }

    const installationIds = userInstallations.map((ui) => ui.installationId);

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
