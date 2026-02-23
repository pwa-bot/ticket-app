import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/response";
import { getSession } from "@/lib/auth";
import { getConnectionDiagnosticSnapshot } from "@/lib/connection-recovery";
import { ensureAdminOrDev } from "@/lib/security/admin-dev-guard";

/**
 * GET /api/admin/connection/diagnose
 *
 * Admin/dev guarded diagnostics endpoint returning canonical connection snapshot.
 */
export async function GET(request: NextRequest) {
  const guard = ensureAdminOrDev(request);
  if (guard) return guard;

  try {
    const session = await getSession();
    const snapshot = await getConnectionDiagnosticSnapshot({
      userId: session?.userId ?? null,
      githubLogin: session?.githubLogin ?? null,
      oauthTokenPresent: Boolean(session?.token),
    });

    return apiSuccess({ snapshot });
  } catch (error) {
    console.error("[/api/admin/connection/diagnose] Error:", error);
    return apiError(error instanceof Error ? error.message : "Failed to diagnose connection", { status: 500 });
  }
}
