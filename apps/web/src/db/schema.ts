import { pgTable, text, timestamp, jsonb, integer, boolean, primaryKey, pgEnum, index } from "drizzle-orm/pg-core";

// Enums
export const syncStatusEnum = pgEnum("sync_status", ["idle", "syncing", "error"]);
export const pendingChangeStatusEnum = pgEnum("pending_change_status", [
  "creating_pr",
  "pending_checks",
  "waiting_review",
  "mergeable",
  "auto_merge_enabled",
  "conflict",
  "failed",
  "merged",
  "closed",
]);

/**
 * Connected repositories that we're tracking.
 * Cache is disposable — can always rebuild from GitHub.
 */
export const repos = pgTable("repos", {
  id: text("id").primaryKey(), // generated ULID
  userId: text("user_id").notNull(), // GitHub user ID who connected
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  fullName: text("full_name").notNull().unique(), // "owner/repo"
  defaultBranch: text("default_branch").notNull().default("main"),
  // SHA-based sync tracking
  lastSeenHeadSha: text("last_seen_head_sha"),
  lastIndexSha: text("last_index_sha"), // SHA of .tickets/index.json
  lastSyncedAt: timestamp("last_synced_at"),
  // Sync status
  syncStatus: syncStatusEnum("sync_status").notNull().default("idle"),
  syncError: text("sync_error"),
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Raw blob cache for .tickets/ files.
 * Disposable — can always refetch from GitHub.
 * Stores both index.json and ticket markdown files.
 */
export const repoBlobs = pgTable("repo_blobs", {
  repoFullName: text("repo_full_name").notNull().references(() => repos.fullName, { onDelete: "cascade" }),
  path: text("path").notNull(), // e.g. ".tickets/index.json" or ".tickets/tickets/01ABC.md"
  sha: text("sha").notNull(), // Git blob SHA
  contentText: text("content_text").notNull(), // Raw file content
  fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.repoFullName, table.path] }),
}));

/**
 * Parsed ticket fields for fast querying.
 * Derived from index.json — disposable cache.
 */
export const tickets = pgTable("tickets", {
  repoFullName: text("repo_full_name").notNull().references(() => repos.fullName, { onDelete: "cascade" }),
  id: text("id").notNull(), // Full ULID
  shortId: text("short_id").notNull(),
  displayId: text("display_id").notNull(),
  title: text("title").notNull(),
  state: text("state").notNull(),
  priority: text("priority").notNull(),
  labels: jsonb("labels").$type<string[]>().notNull().default([]),
  assignee: text("assignee"),
  reviewer: text("reviewer"),
  path: text("path").notNull(), // Path to ticket file
  // SHA tracking for incremental updates
  ticketSha: text("ticket_sha"), // SHA of ticket markdown file (if known)
  indexSha: text("index_sha"), // SHA of index.json used to populate this row
  cachedAt: timestamp("cached_at").notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.repoFullName, table.id] }),
  stateIdx: index("tickets_state_priority_idx").on(table.repoFullName, table.state, table.priority),
}));

/**
 * Pending changes from dashboard-created PRs.
 * Tracks PRs until they merge — does NOT mutate canonical ticket state.
 */
export const pendingChanges = pgTable("pending_changes", {
  id: text("id").primaryKey(), // generated ULID
  repoFullName: text("repo_full_name").notNull().references(() => repos.fullName, { onDelete: "cascade" }),
  ticketId: text("ticket_id").notNull(), // ULID of ticket being changed
  prNumber: integer("pr_number").notNull(),
  prUrl: text("pr_url").notNull(),
  branch: text("branch").notNull(),
  // What changes are pending
  changeSummary: text("change_summary"), // Human-readable summary
  changePatch: jsonb("change_patch").$type<Record<string, unknown>>(), // The actual changes
  // Status tracking
  status: pendingChangeStatusEnum("status").notNull().default("creating_pr"),
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  repoTicketIdx: index("pending_changes_repo_ticket_idx").on(table.repoFullName, table.ticketId),
  repoPrIdx: index("pending_changes_repo_pr_idx").on(table.repoFullName, table.prNumber),
}));

// Type exports
export type Repo = typeof repos.$inferSelect;
export type NewRepo = typeof repos.$inferInsert;
export type RepoBlob = typeof repoBlobs.$inferSelect;
export type NewRepoBlob = typeof repoBlobs.$inferInsert;
export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;
export type PendingChange = typeof pendingChanges.$inferSelect;
export type NewPendingChange = typeof pendingChanges.$inferInsert;
