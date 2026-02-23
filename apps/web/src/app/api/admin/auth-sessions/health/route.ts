import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/response";
import { runAuthSessionHealthProbe } from "@/lib/auth-session-health";
import { ensureAdminOrDev } from "@/lib/security/admin-dev-guard";
import { toRedactedError } from "@/lib/security/redaction";

export async function GET(request: NextRequest) {
  const guard = ensureAdminOrDev(request);
  if (guard) return guard;

  try {
    const includeRoundtrip = request.nextUrl.searchParams.get("roundtrip") !== "0";
    const report = await runAuthSessionHealthProbe({ includeRoundtrip });
    return apiSuccess({ report });
  } catch (error) {
    const redacted = toRedactedError(error);
    console.error("[/api/admin/auth-sessions/health] Error:", redacted);
    return apiError("Failed auth session health probe", { status: 500, details: { errorName: redacted.name } });
  }
}
