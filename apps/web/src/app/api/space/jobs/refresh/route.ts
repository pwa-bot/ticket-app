import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/response";
import { getManualRefreshJobService } from "@/lib/services/manual-refresh-job-service";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.REFRESH_JOBS_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

function parseLimit(req: NextRequest): number {
  const value = Number(req.nextUrl.searchParams.get("limit") ?? "5");
  if (!Number.isFinite(value)) {
    return 5;
  }

  return Math.min(25, Math.max(1, Math.trunc(value)));
}

/**
 * POST /api/space/jobs/refresh
 *
 * Runs queued manual refresh jobs in the background.
 * Requires Authorization: Bearer <REFRESH_JOBS_SECRET>
 */
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return apiError("Unauthorized", { status: 401 });
  }

  const service = getManualRefreshJobService();
  const result = await service.processQueuedJobs(parseLimit(req));

  return apiSuccess({
    ok: true,
    ...result,
    processedAt: new Date().toISOString(),
  }, { legacyTopLevel: false });
}
