import { createSlackApiClient } from "@/lib/slack/api-client";
import { slackNotificationsDbStore } from "@/lib/slack/db-store";
import { createSlackNotificationsService } from "@/lib/services/slack-notifications-service";

export function getSlackNotificationsService() {
  return createSlackNotificationsService({
    store: slackNotificationsDbStore,
    slack: createSlackApiClient(),
    maxMessagesPerChannelPerHour: Number(process.env.SLACK_MAX_MESSAGES_PER_CHANNEL_PER_HOUR ?? "12"),
    reviewReminderHours: Number(process.env.SLACK_REVIEW_REMINDER_HOURS ?? "6"),
  });
}
