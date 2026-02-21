import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import {
  isValidTicketIndexEntry,
  parseVersionedTicketIndexSnapshot,
  shouldFallbackToLastKnownGoodSnapshot,
  type TicketIndexEntry,
} from "@/lib/derived-cache-snapshot";

export interface RepoTicketsWithFallback {
  repo: typeof schema.repos.$inferSelect | null;
  tickets: TicketIndexEntry[];
  source: "postgres_cache" | "stale_cache";
  fallbackReason: string | null;
  snapshotMeta: {
    indexSha: string;
    headSha: string | null;
    capturedAt: string;
  } | null;
}

function toTicketIndexEntries(rows: Array<typeof schema.tickets.$inferSelect>): {
  entries: TicketIndexEntry[];
  hasCorruption: boolean;
} {
  const entries: TicketIndexEntry[] = [];
  let hasCorruption = false;

  for (const row of rows) {
    const entry: TicketIndexEntry = {
      id: row.id,
      short_id: row.shortId,
      display_id: row.displayId,
      title: row.title,
      state: row.state,
      priority: row.priority,
      labels: Array.isArray(row.labels) ? (row.labels as string[]) : [],
      assignee: row.assignee,
      reviewer: row.reviewer,
      path: row.path,
      created: row.createdAt?.toISOString(),
      updated: row.cachedAt?.toISOString(),
    };

    if (!isValidTicketIndexEntry(entry)) {
      hasCorruption = true;
      continue;
    }

    entries.push(entry);
  }

  if (entries.length !== rows.length) {
    hasCorruption = true;
  }

  return { entries, hasCorruption };
}

async function readLastKnownGoodSnapshot(repoId: string): Promise<{
  tickets: TicketIndexEntry[];
  indexSha: string;
  headSha: string | null;
  capturedAt: string;
} | null> {
  const snapshots = await db.query.ticketIndexSnapshots.findMany({
    where: eq(schema.ticketIndexSnapshots.repoId, repoId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
    limit: 10,
  });

  for (const snapshotRow of snapshots) {
    const parsed = parseVersionedTicketIndexSnapshot(snapshotRow.indexJson);
    if (!parsed) {
      continue;
    }

    return {
      tickets: parsed.payload.tickets,
      indexSha: parsed.indexSha,
      headSha: parsed.headSha,
      capturedAt: parsed.capturedAt,
    };
  }

  return null;
}

export async function readRepoTicketsWithFallback(repoFullName: string): Promise<RepoTicketsWithFallback> {
  const [repoRecord, rows] = await Promise.all([
    db.query.repos.findFirst({ where: eq(schema.repos.fullName, repoFullName) }),
    db.query.tickets.findMany({ where: eq(schema.tickets.repoFullName, repoFullName) }),
  ]);
  const repo = repoRecord ?? null;

  const { entries, hasCorruption } = toTicketIndexEntries(rows);
  const fallbackDecision = shouldFallbackToLastKnownGoodSnapshot({
    sync: {
      syncStatus: repo?.syncStatus,
      syncError: repo?.syncError,
      lastSyncedAt: repo?.lastSyncedAt,
    },
    ticketCount: entries.length,
    hasCorruption,
  });

  if (fallbackDecision.shouldFallback && repo?.id) {
    const snapshot = await readLastKnownGoodSnapshot(repo.id);
    if (snapshot) {
      return {
        repo,
        tickets: snapshot.tickets,
        source: "stale_cache",
        fallbackReason: fallbackDecision.reason,
        snapshotMeta: {
          indexSha: snapshot.indexSha,
          headSha: snapshot.headSha,
          capturedAt: snapshot.capturedAt,
        },
      };
    }

    if (hasCorruption) {
      return {
        repo,
        tickets: [],
        source: "stale_cache",
        fallbackReason: "cache_corrupted_no_snapshot",
        snapshotMeta: null,
      };
    }
  }

  return {
    repo,
    tickets: entries,
    source: "postgres_cache",
    fallbackReason: null,
    snapshotMeta: null,
  };
}
