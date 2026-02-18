import { eq } from "drizzle-orm";
import { db, schema } from "./client";
import type { TicketIndex, TicketIndexEntry } from "@/lib/types";

// Extended type with optional timestamp fields
type TicketWithTimestamps = TicketIndexEntry & {
  created?: string;
  updated?: string;
};

interface SyncResult {
  success: boolean;
  ticketCount?: number;
  error?: string;
}

/**
 * Sync a repo's tickets from GitHub to the database.
 * Called on initial connect and when webhooks notify us of changes.
 */
export async function syncRepoTickets(
  repoFullName: string,
  index: TicketIndex,
  indexGeneratedAt?: string
): Promise<SyncResult> {
  try {
    // Update sync status to syncing
    await db
      .insert(schema.syncStatus)
      .values({
        repoFullName,
        status: "syncing",
      })
      .onConflictDoUpdate({
        target: schema.syncStatus.repoFullName,
        set: { status: "syncing" },
      });

    // Delete existing tickets for this repo
    await db.delete(schema.tickets).where(eq(schema.tickets.repoFullName, repoFullName));

    // Insert new tickets
    if (index.tickets.length > 0) {
      const ticketRows = index.tickets.map((t: TicketWithTimestamps) => ({
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
        created: t.created ? new Date(t.created) : null,
        updated: t.updated ? new Date(t.updated) : null,
        cachedAt: new Date(),
      }));

      await db.insert(schema.tickets).values(ticketRows);
    }

    // Update sync status to idle
    await db
      .update(schema.syncStatus)
      .set({
        status: "idle",
        lastSuccessAt: new Date(),
        ticketCount: index.tickets.length,
        indexGeneratedAt: indexGeneratedAt ? new Date(indexGeneratedAt) : null,
        errorMessage: null,
      })
      .where(eq(schema.syncStatus.repoFullName, repoFullName));

    return { success: true, ticketCount: index.tickets.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    // Update sync status to error
    await db
      .update(schema.syncStatus)
      .set({
        status: "error",
        errorMessage: message,
      })
      .where(eq(schema.syncStatus.repoFullName, repoFullName));

    return { success: false, error: message };
  }
}

/**
 * Get cached tickets for a repo
 */
export async function getCachedTickets(repoFullName: string) {
  return db.query.tickets.findMany({
    where: eq(schema.tickets.repoFullName, repoFullName),
    orderBy: (tickets, { asc }) => [asc(tickets.state), asc(tickets.priority), asc(tickets.id)],
  });
}

/**
 * Get sync status for a repo
 */
export async function getSyncStatus(repoFullName: string) {
  return db.query.syncStatus.findFirst({
    where: eq(schema.syncStatus.repoFullName, repoFullName),
  });
}

/**
 * Check if a repo is connected
 */
export async function isRepoConnected(repoFullName: string) {
  const repo = await db.query.repos.findFirst({
    where: eq(schema.repos.fullName, repoFullName),
  });
  return !!repo;
}

/**
 * Connect a repo (add to tracked repos)
 */
export async function connectRepo(
  repoFullName: string,
  userId: string,
  defaultBranch: string,
  isPrivate: boolean
) {
  await db
    .insert(schema.repos)
    .values({
      fullName: repoFullName,
      userId,
      defaultBranch,
      isPrivate,
    })
    .onConflictDoUpdate({
      target: schema.repos.fullName,
      set: {
        userId,
        defaultBranch,
        isPrivate,
        updatedAt: new Date(),
      },
    });

  // Initialize sync status
  await db
    .insert(schema.syncStatus)
    .values({
      repoFullName,
      status: "idle",
    })
    .onConflictDoNothing();
}
