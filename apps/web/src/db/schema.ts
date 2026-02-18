import { pgTable, text, timestamp, jsonb, integer, primaryKey, uniqueIndex, index } from "drizzle-orm/pg-core";

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

// Type exports
export type Repo = typeof repos.$inferSelect;
export type NewRepo = typeof repos.$inferInsert;
export type RepoBlob = typeof repoBlobs.$inferSelect;
export type NewRepoBlob = typeof repoBlobs.$inferInsert;
export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;
export type PendingChange = typeof pendingChanges.$inferSelect;
export type NewPendingChange = typeof pendingChanges.$inferInsert;
