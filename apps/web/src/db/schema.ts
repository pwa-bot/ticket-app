import { pgTable, text, timestamp, jsonb, integer, bigint, boolean, primaryKey, uniqueIndex, index, serial } from "drizzle-orm/pg-core";

/**
 * Users who have signed in via GitHub OAuth.
 */
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(), // ulid
    githubUserId: bigint("github_user_id", { mode: "number" }).notNull().unique(),
    githubLogin: text("github_login").notNull(),
    email: text("email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

/**
 * Repos enabled by a user/org in ticket.app.
 * We treat Postgres as a derived cache only. GitHub is authoritative.
 */
export const repos = pgTable(
  "repos",
  {
    id: text("id").primaryKey(), // ulid/uuid string
    installationId: bigint("installation_id", { mode: "number" }), // links to installations table
    userId: text("user_id"), // legacy, nullable now
    owner: text("owner").notNull(),
    repo: text("repo").notNull(),
    fullName: text("full_name").notNull(), // `${owner}/${repo}` unique
    defaultBranch: text("default_branch").notNull(),
    enabled: boolean("enabled").notNull().default(false), // whether to index this repo

    // GitHub SHA tracking
    headSha: text("head_sha"), // commit sha the cache reflects (webhook-derived)
    webhookSyncedAt: timestamp("webhook_synced_at", { withTimezone: true }), // last successful webhook cache update
    lastSeenHeadSha: text("last_seen_head_sha"), // optional
    lastIndexSha: text("last_index_sha"), // sha of `.tickets/index.json` on default branch

    // Sync status
    syncStatus: text("sync_status").notNull().default("idle"), // idle|syncing|error
    syncError: text("sync_error"),

    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    fullNameIdx: uniqueIndex("repos_full_name_uidx").on(t.fullName),
    userIdx: index("repos_user_idx").on(t.userId),
  })
);

/**
 * Raw derived blobs. Store latest blob for each (repo_full_name, path).
 * This makes ticket detail view fast without re-fetching GitHub.
 */
export const repoBlobs = pgTable(
  "repo_blobs",
  {
    repoFullName: text("repo_full_name").notNull(),
    path: text("path").notNull(), // ".tickets/index.json" or ".tickets/tickets/<ULID>.md"
    sha: text("sha").notNull(), // GitHub blob sha (or content sha)
    contentText: text("content_text").notNull(), // store as text; you can compress later
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.repoFullName, t.path] }),
    repoIdx: index("repo_blobs_repo_idx").on(t.repoFullName),
  })
);

/**
 * Parsed ticket fields for fast querying.
 * Canonical content still lives in Git; this is a cache.
 */
export const tickets = pgTable(
  "tickets",
  {
    repoFullName: text("repo_full_name").notNull(),
    id: text("id").notNull(), // full ULID
    shortId: text("short_id").notNull(), // first 8 chars
    displayId: text("display_id").notNull(), // TK-<shortId>
    title: text("title").notNull(),
    state: text("state").notNull(), // backlog|ready|in_progress|blocked|done
    priority: text("priority").notNull(), // p0..p3
    labels: jsonb("labels").notNull().default([]), // string[]
    assignee: text("assignee"),
    reviewer: text("reviewer"),
    path: text("path").notNull(), // ".tickets/tickets/<ULID>.md"
    createdAt: timestamp("created_at", { withTimezone: true }), // derived from ULID

    // Optional sha tracking
    headSha: text("head_sha"), // commit sha this row was derived from
    ticketSha: text("ticket_sha"), // if we ever fetch ticket file sha
    indexSha: text("index_sha"), // sha of index.json used to populate

    cachedAt: timestamp("cached_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.repoFullName, t.id] }),
    statePriIdx: index("tickets_repo_state_priority_idx").on(t.repoFullName, t.state, t.priority),
    repoIdx: index("tickets_repo_idx").on(t.repoFullName),
  })
);

/**
 * PR metadata cache per ticket.
 * Derived from GitHub webhooks and safe to rebuild from Git.
 */
export const ticketPrs = pgTable(
  "ticket_prs",
  {
    repoFullName: text("repo_full_name").notNull(),
    ticketId: text("ticket_id").notNull(),
    prNumber: integer("pr_number").notNull(),
    prUrl: text("pr_url").notNull(),
    title: text("title"),
    state: text("state"),
    merged: boolean("merged"),
    mergeableState: text("mergeable_state"),
    headRef: text("head_ref"),
    headSha: text("head_sha"),
    checksState: text("checks_state").notNull().default("unknown"), // pass|fail|running|unknown
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.repoFullName, t.ticketId, t.prNumber] }),
    repoTicketIdx: index("ticket_prs_repo_ticket_idx").on(t.repoFullName, t.ticketId),
    repoPrIdx: index("ticket_prs_repo_pr_idx").on(t.repoFullName, t.prNumber),
  })
);

/**
 * Pending ticket-change PRs created by the dashboard.
 * Drives the "pending" UI. Canonical ticket state updates only after merge + sync.
 */
export const pendingChanges = pgTable(
  "pending_changes",
  {
    id: text("id").primaryKey(), // ulid/uuid string
    repoFullName: text("repo_full_name").notNull(),
    ticketId: text("ticket_id").notNull(), // full ULID
    prNumber: integer("pr_number").notNull(),
    prUrl: text("pr_url").notNull(),
    branch: text("branch").notNull(),
    status: text("status").notNull().default("creating_pr"),
    // creating_pr|pending_checks|waiting_review|mergeable|auto_merge_enabled|conflict|failed|merged|closed
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    repoIdx: index("pending_changes_repo_idx").on(t.repoFullName),
    prIdx: uniqueIndex("pending_changes_repo_pr_uidx").on(t.repoFullName, t.prNumber),
    ticketIdx: index("pending_changes_ticket_idx").on(t.repoFullName, t.ticketId),
  })
);

// ============================================================================
// GitHub App + Webhooks Tables (v1.2)
// ============================================================================

/**
 * GitHub App installations.
 * Maps installation ID to account login (org/user).
 */
export const installations = pgTable(
  "installations",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    githubInstallationId: bigint("github_installation_id", { mode: "number" }).notNull().unique(),
    githubAccountLogin: text("github_account_login").notNull(),
    githubAccountType: text("github_account_type").notNull().default("User"), // User | Organization
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

/**
 * Maps users to installations they have access to.
 */
export const userInstallations = pgTable(
  "user_installations",
  {
    userId: text("user_id").notNull(),
    installationId: bigint("installation_id", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.installationId] }),
    installationIdx: index("user_installations_installation_idx").on(t.installationId),
  })
);

/**
 * Repo sync state. Tracks what commit SHA the cache represents.
 */
export const repoSyncState = pgTable(
  "repo_sync_state",
  {
    repoId: text("repo_id").primaryKey(), // references repos.id
    headSha: text("head_sha"),
    lastWebhookDeliveryId: text("last_webhook_delivery_id"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    status: text("status").notNull().default("ok"), // ok|syncing|error
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
  }
);

/**
 * Ticket index snapshots. Store parsed index.json per repo+commit.
 */
export const ticketIndexSnapshots = pgTable(
  "ticket_index_snapshots",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    repoId: text("repo_id").notNull(), // references repos.id
    headSha: text("head_sha").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    indexJson: jsonb("index_json").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    repoShaIdx: uniqueIndex("ticket_index_snapshots_repo_sha_uidx").on(t.repoId, t.headSha),
    repoCreatedIdx: index("ticket_index_snapshots_repo_created_idx").on(t.repoId, t.createdAt),
  })
);

/**
 * PR cache. Stores PR metadata and linked ticket IDs.
 */
export const prCache = pgTable(
  "pr_cache",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    repoId: text("repo_id").notNull(), // references repos.id
    prNumber: integer("pr_number").notNull(),
    prUrl: text("pr_url").notNull(),
    headRef: text("head_ref"),
    title: text("title"),
    state: text("state"), // open|closed
    merged: boolean("merged"),
    mergeableState: text("mergeable_state"),
    linkedTicketShortIds: text("linked_ticket_short_ids").array().notNull().default([]),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    repoPrIdx: uniqueIndex("pr_cache_repo_pr_uidx").on(t.repoId, t.prNumber),
    repoIdx: index("pr_cache_repo_idx").on(t.repoId),
  })
);

/**
 * PR checks cache. Stores CI status per PR.
 */
export const prChecksCache = pgTable(
  "pr_checks_cache",
  {
    repoId: text("repo_id").notNull(),
    prNumber: integer("pr_number").notNull(),
    status: text("status").notNull(), // pass|fail|running|unknown
    details: jsonb("details"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.repoId, t.prNumber] }),
  })
);

/**
 * Webhook delivery dedupe. Stores delivery IDs to prevent double-processing.
 */
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    deliveryId: text("delivery_id").primaryKey(),
    event: text("event").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    receivedAtIdx: index("webhook_deliveries_received_idx").on(t.receivedAt),
  })
);

// ============================================================================
// Slack Integration Tables (v1.3)
// ============================================================================

/**
 * Per-user Slack workspace connection (v1 supports one active workspace per user).
 */
export const slackWorkspaces = pgTable(
  "slack_workspaces",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    teamId: text("team_id").notNull(),
    teamName: text("team_name").notNull(),
    botUserId: text("bot_user_id"),
    botTokenEncrypted: text("bot_token_encrypted").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: uniqueIndex("slack_workspaces_user_uidx").on(t.userId),
    teamIdx: index("slack_workspaces_team_idx").on(t.teamId),
  })
);

/**
 * Channel routing for Slack notifications.
 * scope=portfolio applies to all repos; scope=repo applies to a single repo.
 */
export const slackNotificationChannels = pgTable(
  "slack_notification_channels",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    scope: text("scope").notNull(), // portfolio|repo
    repoFullName: text("repo_full_name"),
    channelId: text("channel_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userScopeRepoIdx: uniqueIndex("slack_notification_channels_user_scope_repo_uidx").on(t.userId, t.scope, t.repoFullName),
    userIdx: index("slack_notification_channels_user_idx").on(t.userId),
  })
);

/**
 * Sent events for dedupe + rate limiting.
 */
export const slackNotificationEvents = pgTable(
  "slack_notification_events",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    teamId: text("team_id").notNull(),
    channelId: text("channel_id").notNull(),
    eventType: text("event_type").notNull(), // digest|review_reminder
    dedupeKey: text("dedupe_key").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    dedupeIdx: uniqueIndex("slack_notification_events_dedupe_uidx").on(t.dedupeKey),
    channelSentIdx: index("slack_notification_events_channel_sent_idx").on(t.channelId, t.sentAt),
    userSentIdx: index("slack_notification_events_user_sent_idx").on(t.userId, t.sentAt),
  })
);

// Type exports
export type Repo = typeof repos.$inferSelect;
export type NewRepo = typeof repos.$inferInsert;
export type RepoBlob = typeof repoBlobs.$inferSelect;
export type NewRepoBlob = typeof repoBlobs.$inferInsert;
export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;
export type TicketPr = typeof ticketPrs.$inferSelect;
export type NewTicketPr = typeof ticketPrs.$inferInsert;
export type PendingChange = typeof pendingChanges.$inferSelect;
export type NewPendingChange = typeof pendingChanges.$inferInsert;
export type Installation = typeof installations.$inferSelect;
export type NewInstallation = typeof installations.$inferInsert;
export type UserInstallation = typeof userInstallations.$inferSelect;
export type RepoSyncState = typeof repoSyncState.$inferSelect;
export type TicketIndexSnapshot = typeof ticketIndexSnapshots.$inferSelect;
export type PrCache = typeof prCache.$inferSelect;
export type PrChecksCache = typeof prChecksCache.$inferSelect;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
