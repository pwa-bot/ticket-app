import { eq, and } from "drizzle-orm";
import { db, schema } from "./client";
import type { TicketIndex, TicketIndexEntry } from "@/lib/types";

// Extended type with optional fields from index
type TicketWithExtras = TicketIndexEntry & {
  created?: string;
  updated?: string;
};

interface SyncResult {
  success: boolean;
  changed: boolean;
  ticketCount?: number;
  indexSha?: string;
  error?: string;
}

interface GitHubBlobInfo {
  sha: string;
  content: string;
}

/**
 * SHA-based incremental sync.
 * 
 * 1. Fetch index.json SHA from GitHub
 * 2. Compare with cached last_index_sha
 * 3. If unchanged, stop (no API calls wasted)
 * 4. If changed, parse index and update tickets table
 * 
 * Does NOT fetch ticket markdown files — that's lazy-loaded on detail view.
 */
export async function syncRepoFromIndex(
  repoFullName: string,
  indexContent: string,
  indexSha: string
): Promise<SyncResult> {
  try {
    // Check if SHA matches cached value
    const repo = await db.query.repos.findFirst({
      where: eq(schema.repos.fullName, repoFullName),
    });

    if (repo?.lastIndexSha === indexSha) {
      // SHA unchanged — update last_synced_at but don't re-parse
      await db
        .update(schema.repos)
        .set({ 
          lastSyncedAt: new Date(),
          syncStatus: "idle",
        })
        .where(eq(schema.repos.fullName, repoFullName));

      return { 
        success: true, 
        changed: false, 
        ticketCount: undefined,
        indexSha,
      };
    }

    // SHA changed — need to update
    await db
      .update(schema.repos)
      .set({ syncStatus: "syncing" })
      .where(eq(schema.repos.fullName, repoFullName));

    // Parse index.json
    const index = JSON.parse(indexContent) as TicketIndex;

    // Store raw blob
    await db
      .insert(schema.repoBlobs)
      .values({
        repoFullName,
        path: ".tickets/index.json",
        sha: indexSha,
        contentText: indexContent,
        fetchedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [schema.repoBlobs.repoFullName, schema.repoBlobs.path],
        set: {
          sha: indexSha,
          contentText: indexContent,
          fetchedAt: new Date(),
        },
      });

    // Delete existing tickets and insert fresh from index
    await db.delete(schema.tickets).where(eq(schema.tickets.repoFullName, repoFullName));

    if (index.tickets.length > 0) {
      const ticketRows = index.tickets.map((t: TicketWithExtras) => ({
        repoFullName,
        id: t.id,
        shortId: t.short_id || t.id.slice(0, 8),
        displayId: t.display_id || `TK-${t.id.slice(0, 8)}`,
        title: t.title,
        state: t.state,
        priority: t.priority,
        labels: t.labels || [],
        assignee: t.assignee,
        reviewer: t.reviewer,
        path: t.path,
        ticketSha: null, // Will be populated when ticket detail is fetched
        indexSha: indexSha,
        cachedAt: new Date(),
      }));

      await db.insert(schema.tickets).values(ticketRows);
    }

    // Update repo metadata
    await db
      .update(schema.repos)
      .set({
        lastIndexSha: indexSha,
        lastSyncedAt: new Date(),
        syncStatus: "idle",
        syncError: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.repos.fullName, repoFullName));

    return { 
      success: true, 
      changed: true, 
      ticketCount: index.tickets.length,
      indexSha,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    await db
      .update(schema.repos)
      .set({
        syncStatus: "error",
        syncError: message,
      })
      .where(eq(schema.repos.fullName, repoFullName));

    return { success: false, changed: false, error: message };
  }
}

/**
 * Get cached tickets for a repo.
 */
export async function getCachedTickets(repoFullName: string) {
  return db.query.tickets.findMany({
    where: eq(schema.tickets.repoFullName, repoFullName),
    orderBy: (tickets, { asc }) => [asc(tickets.state), asc(tickets.priority), asc(tickets.id)],
  });
}

/**
 * Get cached ticket markdown blob.
 * Returns null if not cached — caller should fetch from GitHub.
 */
export async function getCachedTicketBlob(repoFullName: string, ticketPath: string) {
  return db.query.repoBlobs.findFirst({
    where: and(
      eq(schema.repoBlobs.repoFullName, repoFullName),
      eq(schema.repoBlobs.path, ticketPath)
    ),
  });
}

/**
 * Cache a ticket markdown blob after fetching from GitHub.
 */
export async function cacheTicketBlob(
  repoFullName: string,
  ticketPath: string,
  sha: string,
  content: string
) {
  await db
    .insert(schema.repoBlobs)
    .values({
      repoFullName,
      path: ticketPath,
      sha,
      contentText: content,
      fetchedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.repoBlobs.repoFullName, schema.repoBlobs.path],
      set: {
        sha,
        contentText: content,
        fetchedAt: new Date(),
      },
    });

  // Also update ticket's sha reference
  await db
    .update(schema.tickets)
    .set({ ticketSha: sha })
    .where(and(
      eq(schema.tickets.repoFullName, repoFullName),
      eq(schema.tickets.path, ticketPath)
    ));
}

/**
 * Get repo sync metadata.
 */
export async function getRepoSyncStatus(repoFullName: string) {
  return db.query.repos.findFirst({
    where: eq(schema.repos.fullName, repoFullName),
    columns: {
      lastIndexSha: true,
      lastSyncedAt: true,
      syncStatus: true,
      syncError: true,
    },
  });
}

/**
 * Check if a repo is connected.
 */
export async function isRepoConnected(repoFullName: string) {
  const repo = await db.query.repos.findFirst({
    where: eq(schema.repos.fullName, repoFullName),
    columns: { fullName: true },
  });
  return !!repo;
}

/**
 * Connect a repo (add to tracked repos).
 */
export async function connectRepo(
  repoFullName: string,
  userId: string,
  defaultBranch: string
) {
  const [owner, repo] = repoFullName.split("/");
  const id = crypto.randomUUID(); // Simple ID for now

  await db
    .insert(schema.repos)
    .values({
      id,
      userId,
      owner,
      repo,
      fullName: repoFullName,
      defaultBranch,
      syncStatus: "idle",
    })
    .onConflictDoUpdate({
      target: schema.repos.fullName,
      set: {
        userId,
        defaultBranch,
        updatedAt: new Date(),
      },
    });
}

/**
 * Get pending changes for tickets.
 */
export async function getPendingChangesForRepo(repoFullName: string) {
  return db.query.pendingChanges.findMany({
    where: and(
      eq(schema.pendingChanges.repoFullName, repoFullName),
      // Exclude merged/closed
    ),
  });
}

/**
 * Create a pending change record when PR is created.
 */
export async function createPendingChange(data: {
  repoFullName: string;
  ticketId: string;
  prNumber: number;
  prUrl: string;
  branch: string;
  changeSummary?: string;
  changePatch?: Record<string, unknown>;
  status?: "creating_pr" | "pending_checks" | "waiting_review" | "mergeable";
}) {
  const id = crypto.randomUUID();
  
  await db.insert(schema.pendingChanges).values({
    id,
    ...data,
    status: data.status || "pending_checks",
  });

  return id;
}

/**
 * Update pending change status.
 */
export async function updatePendingChangeStatus(
  repoFullName: string,
  prNumber: number,
  status: "merged" | "closed" | "conflict" | "failed" | "mergeable" | "pending_checks"
) {
  await db
    .update(schema.pendingChanges)
    .set({ 
      status,
      updatedAt: new Date(),
    })
    .where(and(
      eq(schema.pendingChanges.repoFullName, repoFullName),
      eq(schema.pendingChanges.prNumber, prNumber)
    ));
}
