import { apiSuccess } from "@/lib/api/response";
import { requireSession } from "@/lib/auth";
import { listAccessibleRepoFullNames } from "@/lib/security/repo-access";
import { auditSlackChannelConfigs } from "@/lib/slack/integrity-audit";
import { getSlackNotificationsService } from "@/lib/slack/service";

export async function GET() {
  const { userId } = await requireSession();
  const service = getSlackNotificationsService();

  const [channels, accessibleRepoFullNames, enabledRepoFullNames] = await Promise.all([
    service.getChannelConfigs(userId),
    listAccessibleRepoFullNames({ userId, enabledOnly: false }),
    listAccessibleRepoFullNames({ userId, enabledOnly: true }),
  ]);

  const audit = auditSlackChannelConfigs({
    channels,
    accessibleRepoFullNames,
    enabledRepoFullNames,
  });

  return apiSuccess(
    {
      audit,
      channels,
      repos: {
        accessible: accessibleRepoFullNames,
        enabled: enabledRepoFullNames,
      },
    },
    { legacyTopLevel: false },
  );
}
