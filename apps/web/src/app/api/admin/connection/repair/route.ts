import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/response";
import { getSession } from "@/lib/auth";
import { getConnectionDiagnosticSnapshot, repairConnectionState } from "@/lib/connection-recovery";
import { ensureAdminOrDev } from "@/lib/security/admin-dev-guard";

/**
 * POST /api/admin/connection/repair
 *
 * Admin/dev guarded one-time safe repair endpoint.
 * Body: { dryRun?: boolean }
 */
export async function POST(request: NextRequest) {
  const guard = ensureAdminOrDev(request);
  if (guard) return guard;

  try {
    const session = await getSession();
    if (!session?.userId) {
      return apiError("Unauthorized", {
        status: 401,
        details: { reasonCode: "AUTH_REQUIRED" },
      });
    }

    const body = (await request.json().catch(() => ({}))) as { dryRun?: boolean };
    const dryRun = body?.dryRun !== false;

    const before = await getConnectionDiagnosticSnapshot({
      userId: session.userId,
      githubLogin: session.githubLogin,
      oauthTokenPresent: Boolean(session.token),
    });

    const repair = await repairConnectionState({ userId: session.userId, dryRun });

    const after = await getConnectionDiagnosticSnapshot({
      userId: session.userId,
      githubLogin: session.githubLogin,
      oauthTokenPresent: Boolean(session.token),
    });

    return apiSuccess({
      dryRun,
      before,
      repair,
      after,
      summary: {
        removedStaleUserInstallationLinks: repair.removedStaleUserInstallationLinks.length,
        relinkedRepos: repair.relinkedRepos.length,
        unresolvedRepos: repair.unresolvedRepos.length,
      },
    });
  } catch (error) {
    console.error("[/api/admin/connection/repair] Error:", error);
    return apiError(error instanceof Error ? error.message : "Failed to repair connection", { status: 500 });
  }
}
