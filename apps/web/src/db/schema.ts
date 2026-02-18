import { pgTable, text, timestamp, jsonb, integer, bigint, boolean, primaryKey, uniqueIndex, index } from "drizzle-orm/pg-core";

/**
 * Repos enabled by a user/org in ticket.app.
 * We treat Postgres as a derived cache only. GitHub is authoritative.
 */
export const repos = pgTable(
  "repos",
  {
    id: text("id").primaryKey(), // ulid/uuid string
    userId: text("user_id").notNull(),
    owner: text("owner").notNull(),
    repo: text("repo").notNull(),
    fullName: text("full_name").notNull(), // `${owner}/${repo}` unique
    defaultBranch: text("default_branch").notNull(),

    // GitHub SHA tracking
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
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

// Type exports
export type Repo = typeof repos.$inferSelect;
export type NewRepo = typeof repos.$inferInsert;
export type RepoBlob = typeof repoBlobs.$inferSelect;
export type NewRepoBlob = typeof repoBlobs.$inferInsert;
export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;
export type PendingChange = typeof pendingChanges.$inferSelect;
export type NewPendingChange = typeof pendingChanges.$inferInsert;
export type Installation = typeof installations.$inferSelect;
export type NewInstallation = typeof installations.$inferInsert;
export type RepoSyncState = typeof repoSyncState.$inferSelect;
export type TicketIndexSnapshot = typeof ticketIndexSnapshots.$inferSelect;
export type PrCache = typeof prCache.$inferSelect;
export type PrChecksCache = typeof prChecksCache.$inferSelect;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
