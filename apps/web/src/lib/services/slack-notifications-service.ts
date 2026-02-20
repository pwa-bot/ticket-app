import type { SlackApiClient } from "@/lib/slack/api-client";

export type SlackChannelScope = "portfolio" | "repo";

export interface SlackWorkspace {
  userId: string;
  teamId: string;
  teamName: string;
  botUserId: string | null;
  botToken: string;
  active: boolean;
}

export interface SlackChannelConfig {
  scope: SlackChannelScope;
  repoFullName: string | null;
  channelId: string;
}

export interface SlackPrSignal {
  prNumber: number;
  prUrl: string;
  checksState: string;
  mergeableState: string | null;
  state: string | null;
  merged: boolean | null;
}

export interface SlackDigestTicketSignal {
  repoFullName: string;
  ticketId: string;
  displayId: string;
  title: string;
  state: string;
  reviewer: string | null;
  waitingReview: boolean;
  prs: SlackPrSignal[];
}

export interface SlackReviewReminderSignal {
  repoFullName: string;
  ticketId: string;
  displayId: string;
  title: string;
  reviewer: string;
  prNumber: number;
  prUrl: string;
  waitingSince: Date;
}

export interface SlackSentEvent {
  userId: string;
  teamId: string;
  channelId: string;
  eventType: "digest" | "review_reminder";
  dedupeKey: string;
  sentAt: Date;
}

export interface SlackNotificationsStore {
  upsertWorkspace(input: SlackWorkspace): Promise<void>;
  getWorkspaceByUser(userId: string): Promise<SlackWorkspace | null>;
  listWorkspaceUserIds(): Promise<string[]>;
  upsertChannelConfig(userId: string, scope: SlackChannelScope, repoFullName: string | null, channelId: string): Promise<void>;
  listChannelConfigs(userId: string): Promise<SlackChannelConfig[]>;
  getEnabledRepoFullNames(userId: string): Promise<string[]>;
  getDigestSignals(userId: string, repoFullNames: string[]): Promise<SlackDigestTicketSignal[]>;
  getReviewReminderSignals(userId: string, repoFullNames: string[], olderThan: Date): Promise<SlackReviewReminderSignal[]>;
  hasSentEvent(dedupeKey: string): Promise<boolean>;
  countSentEventsForChannel(channelId: string, since: Date): Promise<number>;
  recordSentEvent(event: SlackSentEvent): Promise<void>;
}

export interface ConnectWorkspaceResult {
  teamId: string;
  teamName: string;
  botUserId: string | null;
}

export interface SendBatchResult {
  sent: number;
  skipped: number;
  skippedReasons: Array<"no_workspace" | "no_channels" | "rate_limited" | "duplicate" | "no_items">;
}

export interface SlackNotificationsServiceDeps {
  store: SlackNotificationsStore;
  slack: SlackApiClient;
  now?: () => Date;
  appBaseUrl?: string;
  maxMessagesPerChannelPerHour?: number;
  reviewReminderHours?: number;
}

export interface DigestSections {
  mergeableNow: SlackDigestTicketSignal[];
  waitingReview: SlackDigestTicketSignal[];
  failingChecks: SlackDigestTicketSignal[];
  blocked: SlackDigestTicketSignal[];
}

const DEFAULT_MAX_MESSAGES_PER_CHANNEL_PER_HOUR = 12;
const DEFAULT_REVIEW_REMINDER_HOURS = 6;

export function buildTicketDeepLink(baseUrl: string, repoFullName: string, ticketId: string): string {
  const url = new URL("/space", baseUrl);
  url.searchParams.set("tab", "attention");
  url.searchParams.set("repos", repoFullName);
  url.searchParams.set("ticketRepo", repoFullName);
  url.searchParams.set("ticket", ticketId);
  return url.toString();
}

export function classifyDigestSections(items: SlackDigestTicketSignal[]): DigestSections {
  const sections: DigestSections = {
    mergeableNow: [],
    waitingReview: [],
    failingChecks: [],
    blocked: [],
  };

  for (const item of items) {
    const openPrs = item.prs.filter((pr) => pr.state === "open" && !pr.merged);
    const hasFailingChecks = openPrs.some((pr) => pr.checksState === "fail");
    const hasWaitingReview = item.waitingReview || openPrs.some((pr) => pr.mergeableState === "blocked");
    const hasMergeableNow = openPrs.some((pr) => pr.checksState === "pass" && pr.mergeableState === "clean");
    const isBlocked = item.state === "blocked";

    if (hasMergeableNow) sections.mergeableNow.push(item);
    if (hasWaitingReview) sections.waitingReview.push(item);
    if (hasFailingChecks) sections.failingChecks.push(item);
    if (isBlocked) sections.blocked.push(item);
  }

  return sections;
}

function reviewerMention(reviewer: string): string {
  const value = reviewer.trim();
  if (value.toLowerCase().startsWith("slack:")) {
    const slackId = value.slice(6).trim();
    if (slackId) return `<@${slackId}>`;
  }
  return `*${value}*`;
}

function summarizePrStatus(item: SlackDigestTicketSignal): string {
  const openPrs = item.prs.filter((pr) => pr.state === "open" && !pr.merged);
  if (openPrs.length === 0) {
    return `state:${item.state}`;
  }

  const hasFail = openPrs.some((pr) => pr.checksState === "fail");
  const hasRunning = openPrs.some((pr) => pr.checksState === "running");
  const hasPass = openPrs.some((pr) => pr.checksState === "pass");
  const mergeable = openPrs.some((pr) => pr.mergeableState === "clean");
  const blocked = openPrs.some((pr) => pr.mergeableState === "blocked");
  const dirty = openPrs.some((pr) => pr.mergeableState === "dirty");

  const checksSummary = hasFail ? "checks:fail" : hasRunning ? "checks:running" : hasPass ? "checks:pass" : "checks:unknown";
  const mergeSummary = dirty ? "merge:conflict" : blocked ? "merge:review" : mergeable ? "merge:clean" : "merge:unknown";
  return `state:${item.state} ${checksSummary} ${mergeSummary}`;
}

function lineForDigestItem(baseUrl: string, item: SlackDigestTicketSignal): string {
  const ticketUrl = buildTicketDeepLink(baseUrl, item.repoFullName, item.ticketId);
  const openPr = item.prs.find((pr) => pr.state === "open" && !pr.merged) ?? item.prs[0];
  const prText = openPr ? ` · <${openPr.prUrl}|PR #${openPr.prNumber}>` : "";
  return `• [${item.repoFullName}] <${ticketUrl}|${item.displayId}> ${item.title}${prText} — ${summarizePrStatus(item)}`;
}

function sectionText(baseUrl: string, label: string, items: SlackDigestTicketSignal[]): string {
  if (items.length === 0) {
    return `*${label}* (0)\n• none`;
  }

  const lines = items.slice(0, 20).map((item) => lineForDigestItem(baseUrl, item));
  const overflow = items.length - lines.length;
  if (overflow > 0) {
    lines.push(`• …and ${overflow} more`);
  }

  return `*${label}* (${items.length})\n${lines.join("\n")}`;
}

export function formatDigestMessage(baseUrl: string, teamName: string, items: SlackDigestTicketSignal[], sentAt: Date): string {
  const sections = classifyDigestSections(items);
  return [
    `*Ticket attention digest* · ${teamName} · ${sentAt.toISOString().slice(0, 10)}`,
    sectionText(baseUrl, "Mergeable now", sections.mergeableNow),
    sectionText(baseUrl, "Waiting review", sections.waitingReview),
    sectionText(baseUrl, "Failing checks", sections.failingChecks),
    sectionText(baseUrl, "Blocked", sections.blocked),
  ].join("\n\n");
}

export function formatReviewReminderMessage(baseUrl: string, teamName: string, reminders: SlackReviewReminderSignal[], sentAt: Date): string {
  const lines = reminders.slice(0, 30).map((item) => {
    const ticketUrl = buildTicketDeepLink(baseUrl, item.repoFullName, item.ticketId);
    const hours = Math.max(1, Math.floor((sentAt.getTime() - item.waitingSince.getTime()) / (60 * 60 * 1000)));
    return `• [${item.repoFullName}] ${reviewerMention(item.reviewer)}: <${ticketUrl}|${item.displayId}> ${item.title} · <${item.prUrl}|PR #${item.prNumber}> waiting ${hours}h`;
  });

  const overflow = reminders.length - lines.length;
  if (overflow > 0) {
    lines.push(`• …and ${overflow} more`);
  }

  return [
    `*Review reminder* · ${teamName} · ${sentAt.toISOString().slice(0, 10)}`,
    lines.join("\n"),
  ].join("\n\n");
}

function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export function createSlackNotificationsService(deps: SlackNotificationsServiceDeps) {
  const now = deps.now ?? (() => new Date());
  const maxMessagesPerChannelPerHour = deps.maxMessagesPerChannelPerHour ?? DEFAULT_MAX_MESSAGES_PER_CHANNEL_PER_HOUR;
  const reviewReminderHours = deps.reviewReminderHours ?? DEFAULT_REVIEW_REMINDER_HOURS;
  const baseUrl = deps.appBaseUrl ?? process.env.APP_BASE_URL ?? "http://localhost:3000";

  async function connectWorkspace(userId: string, botToken: string): Promise<ConnectWorkspaceResult> {
    const auth = await deps.slack.authTest(botToken);
    if (!auth.ok || !auth.team_id || !auth.team) {
      throw new Error(auth.error ?? "slack_auth_failed");
    }

    await deps.store.upsertWorkspace({
      userId,
      teamId: auth.team_id,
      teamName: auth.team,
      botUserId: auth.user_id ?? null,
      botToken,
      active: true,
    });

    return {
      teamId: auth.team_id,
      teamName: auth.team,
      botUserId: auth.user_id ?? null,
    };
  }

  async function setChannelConfig(userId: string, config: SlackChannelConfig): Promise<void> {
    await deps.store.upsertChannelConfig(userId, config.scope, config.repoFullName, config.channelId);
  }

  async function getChannelConfigs(userId: string): Promise<SlackChannelConfig[]> {
    return deps.store.listChannelConfigs(userId);
  }

  async function sendToChannel(input: {
    workspace: SlackWorkspace;
    channelId: string;
    eventType: "digest" | "review_reminder";
    dedupeKey: string;
    text: string;
    sentAt: Date;
  }): Promise<"sent" | "duplicate" | "rate_limited" | "error"> {
    if (await deps.store.hasSentEvent(input.dedupeKey)) {
      return "duplicate";
    }

    const oneHourAgo = new Date(input.sentAt.getTime() - 60 * 60 * 1000);
    const sentInWindow = await deps.store.countSentEventsForChannel(input.channelId, oneHourAgo);
    if (sentInWindow >= maxMessagesPerChannelPerHour) {
      return "rate_limited";
    }

    const posted = await deps.slack.postMessage(input.workspace.botToken, input.channelId, input.text);
    if (!posted.ok) {
      return "error";
    }

    await deps.store.recordSentEvent({
      userId: input.workspace.userId,
      teamId: input.workspace.teamId,
      channelId: input.channelId,
      eventType: input.eventType,
      dedupeKey: input.dedupeKey,
      sentAt: input.sentAt,
    });

    return "sent";
  }

  async function sendDailyDigestForUser(userId: string): Promise<SendBatchResult> {
    const current = now();
    const workspace = await deps.store.getWorkspaceByUser(userId);
    if (!workspace || !workspace.active) {
      return { sent: 0, skipped: 1, skippedReasons: ["no_workspace"] };
    }

    const channels = await deps.store.listChannelConfigs(userId);
    if (channels.length === 0) {
      return { sent: 0, skipped: 1, skippedReasons: ["no_channels"] };
    }

    const enabledRepos = await deps.store.getEnabledRepoFullNames(userId);
    if (enabledRepos.length === 0) {
      return { sent: 0, skipped: 1, skippedReasons: ["no_items"] };
    }

    const signals = await deps.store.getDigestSignals(userId, enabledRepos);
    if (signals.length === 0) {
      return { sent: 0, skipped: 1, skippedReasons: ["no_items"] };
    }

    const byRepo = new Map<string, SlackDigestTicketSignal[]>();
    for (const signal of signals) {
      const existing = byRepo.get(signal.repoFullName) ?? [];
      existing.push(signal);
      byRepo.set(signal.repoFullName, existing);
    }

    const portfolioChannel = channels.find((c) => c.scope === "portfolio");
    const repoChannels = channels.filter((c) => c.scope === "repo" && c.repoFullName);

    const targets: Array<{ channelId: string; targetKey: string; items: SlackDigestTicketSignal[] }> = [];

    if (portfolioChannel) {
      targets.push({
        channelId: portfolioChannel.channelId,
        targetKey: "portfolio",
        items: signals,
      });
    }

    for (const channel of repoChannels) {
      const repoItems = byRepo.get(channel.repoFullName!) ?? [];
      targets.push({
        channelId: channel.channelId,
        targetKey: `repo:${channel.repoFullName}`,
        items: repoItems,
      });
    }

    let sent = 0;
    let skipped = 0;
    const skippedReasons: SendBatchResult["skippedReasons"] = [];
    for (const target of targets) {
      if (target.items.length === 0) {
        skipped += 1;
        skippedReasons.push("no_items");
        continue;
      }

      const dedupe = `slack:digest:${userId}:${target.channelId}:${target.targetKey}:${dayKey(current)}`;
      const text = formatDigestMessage(baseUrl, workspace.teamName, target.items, current);
      const result = await sendToChannel({
        workspace,
        channelId: target.channelId,
        eventType: "digest",
        dedupeKey: dedupe,
        text,
        sentAt: current,
      });

      if (result === "sent") {
        sent += 1;
      } else {
        skipped += 1;
        if (result === "duplicate") skippedReasons.push("duplicate");
        if (result === "rate_limited") skippedReasons.push("rate_limited");
      }
    }

    return { sent, skipped, skippedReasons: unique(skippedReasons) };
  }

  async function sendReviewRemindersForUser(userId: string): Promise<SendBatchResult> {
    const current = now();
    const workspace = await deps.store.getWorkspaceByUser(userId);
    if (!workspace || !workspace.active) {
      return { sent: 0, skipped: 1, skippedReasons: ["no_workspace"] };
    }

    const channels = await deps.store.listChannelConfigs(userId);
    if (channels.length === 0) {
      return { sent: 0, skipped: 1, skippedReasons: ["no_channels"] };
    }

    const enabledRepos = await deps.store.getEnabledRepoFullNames(userId);
    if (enabledRepos.length === 0) {
      return { sent: 0, skipped: 1, skippedReasons: ["no_items"] };
    }

    const olderThan = new Date(current.getTime() - reviewReminderHours * 60 * 60 * 1000);
    const reminders = await deps.store.getReviewReminderSignals(userId, enabledRepos, olderThan);
    if (reminders.length === 0) {
      return { sent: 0, skipped: 1, skippedReasons: ["no_items"] };
    }

    const portfolioChannel = channels.find((c) => c.scope === "portfolio");
    const repoChannelMap = new Map(
      channels
        .filter((c) => c.scope === "repo" && c.repoFullName)
        .map((c) => [c.repoFullName!, c.channelId]),
    );

    const byChannel = new Map<string, SlackReviewReminderSignal[]>();
    for (const reminder of reminders) {
      const channelId = repoChannelMap.get(reminder.repoFullName) ?? portfolioChannel?.channelId;
      if (!channelId) {
        continue;
      }
      const existing = byChannel.get(channelId) ?? [];
      existing.push(reminder);
      byChannel.set(channelId, existing);
    }

    if (byChannel.size === 0) {
      return { sent: 0, skipped: 1, skippedReasons: ["no_channels"] };
    }

    let sent = 0;
    let skipped = 0;
    const skippedReasons: SendBatchResult["skippedReasons"] = [];
    for (const [channelId, rows] of byChannel.entries()) {
      const dedupe = `slack:review:${userId}:${channelId}:${dayKey(current)}`;
      const text = formatReviewReminderMessage(baseUrl, workspace.teamName, rows, current);
      const result = await sendToChannel({
        workspace,
        channelId,
        eventType: "review_reminder",
        dedupeKey: dedupe,
        text,
        sentAt: current,
      });

      if (result === "sent") {
        sent += 1;
      } else {
        skipped += 1;
        if (result === "duplicate") skippedReasons.push("duplicate");
        if (result === "rate_limited") skippedReasons.push("rate_limited");
      }
    }

    return { sent, skipped, skippedReasons: unique(skippedReasons) };
  }

  async function sendDailyDigestForAllUsers(): Promise<{ users: number; sent: number; skipped: number }> {
    const userIds = await deps.store.listWorkspaceUserIds();
    let sent = 0;
    let skipped = 0;
    for (const userId of userIds) {
      const result = await sendDailyDigestForUser(userId);
      sent += result.sent;
      skipped += result.skipped;
    }
    return { users: userIds.length, sent, skipped };
  }

  async function sendReviewRemindersForAllUsers(): Promise<{ users: number; sent: number; skipped: number }> {
    const userIds = await deps.store.listWorkspaceUserIds();
    let sent = 0;
    let skipped = 0;
    for (const userId of userIds) {
      const result = await sendReviewRemindersForUser(userId);
      sent += result.sent;
      skipped += result.skipped;
    }
    return { users: userIds.length, sent, skipped };
  }

  return {
    connectWorkspace,
    setChannelConfig,
    getChannelConfigs,
    sendDailyDigestForUser,
    sendReviewRemindersForUser,
    sendDailyDigestForAllUsers,
    sendReviewRemindersForAllUsers,
  };
}
