import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { apiSuccess } from "@/lib/api/response";
import { requireSession } from "@/lib/auth";
import { getConnectionState } from "@/lib/connection-state";

/**
 * GET /api/github/installations
 *
 * Cache-first: returns installations from local DB links only.
 *
 * Important: this endpoint intentionally performs ZERO background GitHub calls.
 * Use POST /api/github/installations/refresh for explicit, rate-safe refresh.
 */
export async function GET() {
  try {
    const { userId } = await requireSession();
    const connection = await getConnectionState();

    const userInstallations = await db.query.userInstallations.findMany({
      where: eq(schema.userInstallations.userId, userId),
    });

    if (userInstallations.length === 0) {
      return apiSuccess({ installations: [], connection });
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
      connection,
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    throw error;
  }
}
