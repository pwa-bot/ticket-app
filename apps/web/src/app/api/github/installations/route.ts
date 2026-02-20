import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { apiSuccess } from "@/lib/api/response";
import { requireSession } from "@/lib/auth";

/**
 * GET /api/github/installations
 *
 * Cache-first: returns installations from local DB links only.
 *
 * Important: this endpoint intentionally performs ZERO background GitHub calls.
 * Use POST /api/github/installations/refresh for explicit, rate-safe refresh.
 */
export async function GET() {
  const { userId } = await requireSession();

  const userInstallations = await db.query.userInstallations.findMany({
    where: eq(schema.userInstallations.userId, userId),
  });

  if (userInstallations.length === 0) {
    return apiSuccess({ installations: [] });
  }

  const installationIds = userInstallations.map((ui) => ui.installationId);
  const installations = await db.query.installations.findMany({
    where: inArray(schema.installations.id, installationIds),
  });

  return apiSuccess({
    installations: installations.map((installation) => ({
      installationId: installation.githubInstallationId,
      accountLogin: installation.githubAccountLogin,
      accountType: installation.githubAccountType,
    })),
  });
}
