import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTicketDeepLink,
  classifyDigestSections,
  createSlackNotificationsService,
  formatDigestMessage,
  formatReviewReminderMessage,
  type SlackChannelConfig,
  type SlackDigestTicketSignal,
  type SlackNotificationsStore,
  type SlackReviewReminderSignal,
  type SlackWorkspace,
} from "../slack-notifications-service";
import type { SlackApiClient } from "@/lib/slack/api-client";

function createStore(overrides: Partial<SlackNotificationsStore> = {}): SlackNotificationsStore {
  const sentEvents = new Set<string>();
  const configs: SlackChannelConfig[] = [{ scope: "portfolio", repoFullName: null, channelId: "C1" }];

  return {
    upsertWorkspace: async () => undefined,
    getWorkspaceByUser: async () =>
      ({
        userId: "u1",
        teamId: "T1",
        teamName: "Acme",
        botUserId: "Ubot",
        botToken: "xoxb-token",
        active: true,
      } satisfies SlackWorkspace),
    listWorkspaceUserIds: async () => ["u1"],
    upsertChannelConfig: async () => undefined,
    listChannelConfigs: async () => configs,
    getEnabledRepoFullNames: async () => ["acme/repo"],
    getDigestSignals: async () => [
      {
        repoFullName: "acme/repo",
        ticketId: "01KABCDE123456",
        displayId: "TK-01KABCDE",
        title: "Ship feature",
        state: "ready",
        reviewer: "slack:U123",
        waitingReview: true,
        prs: [
          {
            prNumber: 42,
            prUrl: "https://github.com/acme/repo/pull/42",
            checksState: "pass",
            mergeableState: "clean",
            state: "open",
            merged: false,
          },
        ],
      },
    ] satisfies SlackDigestTicketSignal[],
    getReviewReminderSignals: async () => [
      {
        repoFullName: "acme/repo",
        ticketId: "01KABCDE123456",
        displayId: "TK-01KABCDE",
        title: "Ship feature",
        reviewer: "slack:U123",
        prNumber: 42,
        prUrl: "https://github.com/acme/repo/pull/42",
        waitingSince: new Date("2026-02-20T00:00:00.000Z"),
      },
    ] satisfies SlackReviewReminderSignal[],
    hasSentEvent: async (dedupeKey) => sentEvents.has(dedupeKey),
    countSentEventsForChannel: async () => 0,
    recordSentEvent: async (event) => {
      sentEvents.add(event.dedupeKey);
    },
    ...overrides,
  };
}

function createSlack(calls: string[] = []): SlackApiClient {
  return {
    authTest: async () => ({ ok: true, team_id: "T1", team: "Acme", user_id: "Ubot" }),
    postMessage: async (_token, _channel, text) => {
      calls.push(text);
      return { ok: true, ts: "1.23" };
    },
  };
}

test("buildTicketDeepLink creates stable deep link query", () => {
  const url = buildTicketDeepLink("https://ticket.app", "acme/repo", "01KABCDE123456");
  assert.match(url, /^https:\/\/ticket\.app\/space\?/);
  assert.match(url, /ticket=01KABCDE123456/);
  assert.match(url, /ticketRepo=acme%2Frepo/);
});

test("classifyDigestSections maps mergeable/waiting/failing/blocked sections", () => {
  const sections = classifyDigestSections([
    {
      repoFullName: "acme/repo",
      ticketId: "a",
      displayId: "TK-A",
      title: "A",
      state: "blocked",
      reviewer: null,
      waitingReview: false,
      prs: [{ prNumber: 1, prUrl: "u", checksState: "fail", mergeableState: "dirty", state: "open", merged: false }],
    },
    {
      repoFullName: "acme/repo",
      ticketId: "b",
      displayId: "TK-B",
      title: "B",
      state: "ready",
      reviewer: null,
      waitingReview: true,
      prs: [{ prNumber: 2, prUrl: "u", checksState: "pass", mergeableState: "clean", state: "open", merged: false }],
    },
  ]);

  assert.equal(sections.blocked.length, 1);
  assert.equal(sections.failingChecks.length, 1);
  assert.equal(sections.waitingReview.length, 1);
  assert.equal(sections.mergeableNow.length, 1);
});

test("formatDigestMessage includes ticket and PR deep links", () => {
  const text = formatDigestMessage(
    "https://ticket.app",
    "Acme",
    [
      {
        repoFullName: "acme/repo",
        ticketId: "01KABCDE123456",
        displayId: "TK-01KABCDE",
        title: "Ship feature",
        state: "ready",
        reviewer: null,
        waitingReview: false,
        prs: [{ prNumber: 42, prUrl: "https://github.com/acme/repo/pull/42", checksState: "pass", mergeableState: "clean", state: "open", merged: false }],
      },
    ],
    new Date("2026-02-20T08:00:00.000Z"),
  );

  assert.match(text, /Mergeable now/);
  assert.match(text, /https:\/\/ticket\.app\/space\?/);
  assert.match(text, /https:\/\/github\.com\/acme\/repo\/pull\/42/);
});

test("formatReviewReminderMessage renders reviewer mention and wait time", () => {
  const text = formatReviewReminderMessage(
    "https://ticket.app",
    "Acme",
    [
      {
        repoFullName: "acme/repo",
        ticketId: "01KABCDE123456",
        displayId: "TK-01KABCDE",
        title: "Ship feature",
        reviewer: "slack:U123",
        prNumber: 42,
        prUrl: "https://github.com/acme/repo/pull/42",
        waitingSince: new Date("2026-02-20T00:00:00.000Z"),
      },
    ],
    new Date("2026-02-20T09:00:00.000Z"),
  );

  assert.match(text, /<@U123>/);
  assert.match(text, /waiting 9h/);
});

test("sendDailyDigestForUser sends one digest then dedupes", async () => {
  const messages: string[] = [];
  const service = createSlackNotificationsService({
    store: createStore(),
    slack: createSlack(messages),
    now: () => new Date("2026-02-20T09:00:00.000Z"),
    appBaseUrl: "https://ticket.app",
  });

  const first = await service.sendDailyDigestForUser("u1");
  const second = await service.sendDailyDigestForUser("u1");

  assert.equal(first.sent, 1);
  assert.equal(second.sent, 0);
  assert.match(second.skippedReasons.join(","), /duplicate/);
  assert.equal(messages.length, 1);
});

test("sendDailyDigestForUser honors channel rate limit", async () => {
  const messages: string[] = [];
  const service = createSlackNotificationsService({
    store: createStore({
      countSentEventsForChannel: async () => 10,
    }),
    slack: createSlack(messages),
    now: () => new Date("2026-02-20T09:00:00.000Z"),
    appBaseUrl: "https://ticket.app",
    maxMessagesPerChannelPerHour: 10,
  });

  const result = await service.sendDailyDigestForUser("u1");
  assert.equal(result.sent, 0);
  assert.match(result.skippedReasons.join(","), /rate_limited/);
  assert.equal(messages.length, 0);
});

test("sendReviewRemindersForUser sends reminders with deep links", async () => {
  const messages: string[] = [];
  const service = createSlackNotificationsService({
    store: createStore(),
    slack: createSlack(messages),
    now: () => new Date("2026-02-20T09:00:00.000Z"),
    appBaseUrl: "https://ticket.app",
    reviewReminderHours: 6,
  });

  const result = await service.sendReviewRemindersForUser("u1");
  assert.equal(result.sent, 1);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /Review reminder/);
  assert.match(messages[0], /https:\/\/ticket\.app\/space\?/);
});
