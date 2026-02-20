import { NextRequest } from "next/server";
import { apiSuccess } from "@/lib/api/response";
import { requireSession } from "@/lib/auth";
import { applyMutationGuards } from "@/lib/security/mutation-guard";
import { getSlackNotificationsService } from "@/lib/slack/service";

export async function POST(req: NextRequest) {
  const { userId } = await requireSession();
  const guard = applyMutationGuards({
    request: req,
    bucket: "slack-digest",
    identity: userId,
    limit: 6,
    windowMs: 60_000,
  });
  if (guard) {
    return guard;
  }

  const service = getSlackNotificationsService();
  const result = await service.sendDailyDigestForUser(userId);
  return apiSuccess(result, { legacyTopLevel: false });
}
