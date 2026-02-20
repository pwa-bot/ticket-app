import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { decryptToken, encryptToken } from "@/lib/auth";
import type {
  SlackChannelScope,
  SlackDigestTicketSignal,
  SlackNotificationsStore,
  SlackReviewReminderSignal,
  SlackSentEvent,
  SlackWorkspace,
} from "@/lib/services/slack-notifications-service";

function ticketKey(repoFullName: string, ticketId: string): string {
  return `${repoFullName}:${ticketId}`;
}

function prKey(repoFullName: string, prNumber: number): string {
  return `${repoFullName}:${prNumber}`;
}

export const slackNotificationsDbStore: SlackNotificationsStore = {
  async upsertWorkspace(input: SlackWorkspace): Promise<void> {
    const tokenEncrypted = encryptToken(input.botToken);
    await db
      .insert(schema.slackWorkspaces)
      .values({
        userId: input.userId,
        teamId: input.teamId,
        teamName: input.teamName,
        botUserId: input.botUserId,
        botTokenEncrypted: tokenEncrypted,
        active: input.active,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.slackWorkspaces.userId,
        set: {
          teamId: input.teamId,
          teamName: input.teamName,
          botUserId: input.botUserId,
          botTokenEncrypted: tokenEncrypted,
          active: input.active,
          updatedAt: new Date(),
        },
      });
  },

  async getWorkspaceByUser(userId: string): Promise<SlackWorkspace | null> {
    const row = await db.query.slackWorkspaces.findFirst({
      where: eq(schema.slackWorkspaces.userId, userId),
    });
    if (!row) return null;

    const token = decryptToken(row.botTokenEncrypted);
    if (!token) return null;

    return {
      userId: row.userId,
      teamId: row.teamId,
      teamName: row.teamName,
      botUserId: row.botUserId ?? null,
      botToken: token,
      active: row.active,
    };
  },

  async listWorkspaceUserIds(): Promise<string[]> {
    const rows = await db.query.slackWorkspaces.findMany({
      where: eq(schema.slackWorkspaces.active, true),
    });
    return Array.from(new Set(rows.map((r) => r.userId)));
  },

  async upsertChannelConfig(userId: string, scope: SlackChannelScope, repoFullName: string | null, channelId: string): Promise<void> {
    if (scope === "portfolio") {
      await db
        .delete(schema.slackNotificationChannels)
        .where(
          and(
            eq(schema.slackNotificationChannels.userId, userId),
            eq(schema.slackNotificationChannels.scope, "portfolio"),
          ),
        );

      await db.insert(schema.slackNotificationChannels).values({
        userId,
        scope,
        repoFullName: null,
        channelId,
      });
      return;
    }

    if (!repoFullName) {
      throw new Error("repo_full_name_required");
    }

    await db
      .insert(schema.slackNotificationChannels)
      .values({
        userId,
        scope,
        repoFullName,
        channelId,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          schema.slackNotificationChannels.userId,
          schema.slackNotificationChannels.scope,
          schema.slackNotificationChannels.repoFullName,
        ],
        set: {
          channelId,
          updatedAt: new Date(),
        },
      });
  },

  async listChannelConfigs(userId: string) {
    const rows = await db.query.slackNotificationChannels.findMany({
      where: eq(schema.slackNotificationChannels.userId, userId),
    });
    return rows.map((row) => ({
      scope: row.scope as SlackChannelScope,
      repoFullName: row.repoFullName,
      channelId: row.channelId,
    }));
  },

  async getEnabledRepoFullNames(userId: string): Promise<string[]> {
    const installs = await db.query.userInstallations.findMany({
      where: eq(schema.userInstallations.userId, userId),
    });
    if (installs.length === 0) {
      return [];
    }

    const repos = await db.query.repos.findMany({
      where: and(
        eq(schema.repos.enabled, true),
        inArray(schema.repos.installationId, installs.map((i) => i.installationId)),
      ),
    });

    return repos.map((repo) => repo.fullName);
  },

  async getDigestSignals(_userId: string, repoFullNames: string[]): Promise<SlackDigestTicketSignal[]> {
    if (repoFullNames.length === 0) return [];

    const [tickets, prs, waitingReview] = await Promise.all([
      db.query.tickets.findMany({
        where: inArray(schema.tickets.repoFullName, repoFullNames),
      }),
      db.query.ticketPrs.findMany({
        where: inArray(schema.ticketPrs.repoFullName, repoFullNames),
      }),
      db.query.pendingChanges.findMany({
        where: and(
          inArray(schema.pendingChanges.repoFullName, repoFullNames),
          eq(schema.pendingChanges.status, "waiting_review"),
        ),
      }),
    ]);

    const waitingReviewSet = new Set(waitingReview.map((row) => ticketKey(row.repoFullName, row.ticketId)));
    const prsByTicket = new Map<string, typeof prs>();
    for (const pr of prs) {
      const key = ticketKey(pr.repoFullName, pr.ticketId);
      const list = prsByTicket.get(key) ?? [];
      list.push(pr);
      prsByTicket.set(key, list);
    }

    return tickets.map((ticket) => ({
      repoFullName: ticket.repoFullName,
      ticketId: ticket.id,
      displayId: ticket.displayId,
      title: ticket.title,
      state: ticket.state,
      reviewer: ticket.reviewer,
      waitingReview: waitingReviewSet.has(ticketKey(ticket.repoFullName, ticket.id)),
      prs: (prsByTicket.get(ticketKey(ticket.repoFullName, ticket.id)) ?? []).map((pr) => ({
        prNumber: pr.prNumber,
        prUrl: pr.prUrl,
        checksState: pr.checksState,
        mergeableState: pr.mergeableState,
        state: pr.state,
        merged: pr.merged,
      })),
    }));
  },

  async getReviewReminderSignals(_userId: string, repoFullNames: string[], olderThan: Date): Promise<SlackReviewReminderSignal[]> {
    if (repoFullNames.length === 0) return [];

    const waitingRows = await db.query.pendingChanges.findMany({
      where: and(
        inArray(schema.pendingChanges.repoFullName, repoFullNames),
        eq(schema.pendingChanges.status, "waiting_review"),
        lte(schema.pendingChanges.updatedAt, olderThan),
      ),
    });
    if (waitingRows.length === 0) return [];

    const tickets = await db.query.tickets.findMany({
      where: inArray(schema.tickets.repoFullName, repoFullNames),
    });
    const ticketMap = new Map(tickets.map((ticket) => [ticketKey(ticket.repoFullName, ticket.id), ticket]));

    const prs = await db.query.ticketPrs.findMany({
      where: inArray(schema.ticketPrs.repoFullName, repoFullNames),
    });
    const prMap = new Map(prs.map((pr) => [prKey(pr.repoFullName, pr.prNumber), pr]));

    const out: SlackReviewReminderSignal[] = [];
    for (const row of waitingRows) {
      const ticket = ticketMap.get(ticketKey(row.repoFullName, row.ticketId));
      if (!ticket?.reviewer) {
        continue;
      }

      const pr = prMap.get(prKey(row.repoFullName, row.prNumber));
      if (!pr?.prUrl) {
        continue;
      }

      out.push({
        repoFullName: row.repoFullName,
        ticketId: row.ticketId,
        displayId: ticket.displayId,
        title: ticket.title,
        reviewer: ticket.reviewer,
        prNumber: row.prNumber,
        prUrl: pr.prUrl,
        waitingSince: row.updatedAt,
      });
    }

    return out;
  },

  async hasSentEvent(dedupeKey: string): Promise<boolean> {
    const row = await db.query.slackNotificationEvents.findFirst({
      where: eq(schema.slackNotificationEvents.dedupeKey, dedupeKey),
    });
    return !!row;
  },

  async countSentEventsForChannel(channelId: string, since: Date): Promise<number> {
    const rows = await db.query.slackNotificationEvents.findMany({
      where: and(
        eq(schema.slackNotificationEvents.channelId, channelId),
        gte(schema.slackNotificationEvents.sentAt, since),
      ),
    });
    return rows.length;
  },

  async recordSentEvent(event: SlackSentEvent): Promise<void> {
    await db
      .insert(schema.slackNotificationEvents)
      .values({
        userId: event.userId,
        teamId: event.teamId,
        channelId: event.channelId,
        eventType: event.eventType,
        dedupeKey: event.dedupeKey,
        sentAt: event.sentAt,
      })
      .onConflictDoNothing();
  },
};
