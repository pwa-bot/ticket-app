import { pgTable, text, timestamp, jsonb, integer, boolean, primaryKey } from "drizzle-orm/pg-core";

/**
 * Connected repositories that we're tracking
 */
export const repos = pgTable("repos", {
  // "owner/repo" format
  fullName: text("full_name").primaryKey(),
  // GitHub user ID who connected this repo
  userId: text("user_id").notNull(),
  // Default branch (usually "main")
  defaultBranch: text("default_branch").notNull().default("main"),
  // Whether the repo is private
  isPrivate: boolean("is_private").notNull().default(false),
  // Webhook ID if we've set one up
  webhookId: integer("webhook_id"),
  // Last time we synced from GitHub
  lastSyncedAt: timestamp("last_synced_at"),
  // Created/updated timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Cached ticket index entries
 */
export const tickets = pgTable("tickets", {
  // Composite key: repo + ticket ID
  repoFullName: text("repo_full_name").notNull().references(() => repos.fullName, { onDelete: "cascade" }),
  id: text("id").notNull(), // Full ULID
  // Display info
  shortId: text("short_id").notNull(),
  displayId: text("display_id").notNull(),
  title: text("title").notNull(),
  // State and priority
  state: text("state").notNull(),
  priority: text("priority").notNull(),
  // Labels as JSON array
  labels: jsonb("labels").$type<string[]>().notNull().default([]),
  // Optional fields
  assignee: text("assignee"),
  reviewer: text("reviewer"),
  // Path to ticket file
  path: text("path").notNull(),
  // Timestamps from ticket
  created: timestamp("created"),
  updated: timestamp("updated"),
  // Cache metadata
  cachedAt: timestamp("cached_at").notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.repoFullName, table.id] }),
}));

/**
 * Sync status for each repo
 */
export const syncStatus = pgTable("sync_status", {
  repoFullName: text("repo_full_name").primaryKey().references(() => repos.fullName, { onDelete: "cascade" }),
  // Current sync state
  status: text("status").$type<"idle" | "syncing" | "error">().notNull().default("idle"),
  // Last successful sync
  lastSuccessAt: timestamp("last_success_at"),
  // Error message if status is "error"
  errorMessage: text("error_message"),
  // Number of tickets in last sync
  ticketCount: integer("ticket_count"),
  // Index.json generated_at timestamp from GitHub
  indexGeneratedAt: timestamp("index_generated_at"),
});

// Type exports for use in application code
export type Repo = typeof repos.$inferSelect;
export type NewRepo = typeof repos.$inferInsert;
export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;
export type SyncStatus = typeof syncStatus.$inferSelect;
