import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/response";
import { repairExpiredAuthSessions, runAuthSessionHealthProbe } from "@/lib/auth-session-health";
import { ensureAdminOrDev } from "@/lib/security/admin-dev-guard";
import { toRedactedError } from "@/lib/security/redaction";

export async function POST(request: NextRequest) {
  const guard = ensureAdminOrDev(request);
  if (guard) return guard;

  try {
    const body = (await request.json().catch(() => ({}))) as { dryRun?: boolean };
    const dryRun = body?.dryRun !== false;

    const before = await runAuthSessionHealthProbe({ includeRoundtrip: false });
    const repair = await repairExpiredAuthSessions({ dryRun });
    const after = await runAuthSessionHealthProbe({ includeRoundtrip: false });

    return apiSuccess({
      dryRun,
      before,
      repair,
      after,
    });
  } catch (error) {
    const redacted = toRedactedError(error);
    console.error("[/api/admin/auth-sessions/repair] Error:", redacted);
    return apiError("Failed auth session repair", { status: 500, details: { errorName: redacted.name } });
  }
}
