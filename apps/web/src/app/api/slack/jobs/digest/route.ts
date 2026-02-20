import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/response";
import { getSlackNotificationsService } from "@/lib/slack/service";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.SLACK_JOBS_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return apiError("Unauthorized", { status: 401 });
  }

  const service = getSlackNotificationsService();
  const result = await service.sendDailyDigestForAllUsers();
  return apiSuccess(result, { legacyTopLevel: false });
}
