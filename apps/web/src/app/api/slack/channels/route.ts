import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/response";
import { requireSession } from "@/lib/auth";
import { applyMutationGuards } from "@/lib/security/mutation-guard";
import { hasRepoAccess } from "@/lib/security/repo-access";
import { getSlackNotificationsService } from "@/lib/slack/service";

export async function GET() {
  const { userId } = await requireSession();
  const service = getSlackNotificationsService();
  const channels = await service.getChannelConfigs(userId);
  return apiSuccess({ channels }, { legacyTopLevel: false });
}

export async function POST(req: NextRequest) {
  const { userId } = await requireSession();
  const guard = applyMutationGuards({
    request: req,
    bucket: "slack-channels",
    identity: userId,
    limit: 30,
    windowMs: 60_000,
  });
  if (guard) {
    return guard;
  }

  const body = await req.json();
  const scope = body?.scope === "repo" ? "repo" : body?.scope === "portfolio" ? "portfolio" : null;
  const channelId = typeof body?.channelId === "string" ? body.channelId.trim() : "";
  const repoFullName = typeof body?.repoFullName === "string" ? body.repoFullName.trim() : null;

  if (!scope || !channelId) {
    return apiError("scope and channelId are required", { status: 400 });
  }

  if (scope === "repo") {
    if (!repoFullName || !repoFullName.includes("/")) {
      return apiError("repoFullName is required for repo scope", { status: 400 });
    }
    if (!(await hasRepoAccess(userId, repoFullName))) {
      return apiError("Forbidden", { status: 403 });
    }
  }

  const service = getSlackNotificationsService();
  await service.setChannelConfig(userId, {
    scope,
    repoFullName: scope === "repo" ? repoFullName : null,
    channelId,
  });

  return apiSuccess({ ok: true }, { legacyTopLevel: false });
}
