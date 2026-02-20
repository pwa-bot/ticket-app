import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/response";
import { requireSession } from "@/lib/auth";
import { applyMutationGuards } from "@/lib/security/mutation-guard";
import { getSlackNotificationsService } from "@/lib/slack/service";

export async function POST(req: NextRequest) {
  const { userId } = await requireSession();
  const guard = applyMutationGuards({
    request: req,
    bucket: "slack-connect",
    identity: userId,
    limit: 5,
    windowMs: 60_000,
  });
  if (guard) {
    return guard;
  }

  const body = await req.json();
  const token = typeof body?.botToken === "string" ? body.botToken.trim() : "";
  if (!token) {
    return apiError("botToken is required", { status: 400 });
  }

  try {
    const service = getSlackNotificationsService();
    const connected = await service.connectWorkspace(userId, token);
    return apiSuccess({ connected: true, workspace: connected }, { legacyTopLevel: false });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "slack_connect_failed", { status: 400 });
  }
}
