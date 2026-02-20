import { eq, and, notInArray } from "drizzle-orm";
import { db, schema } from "./client";

// Helper for timestamps
const now = () => new Date();

// ULID timestamp decoding (first 10 chars = Crockford base32 timestamp)
const CROCKFORD_DECODE: Record<string, number> = {
  "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  "A": 10, "B": 11, "C": 12, "D": 13, "E": 14, "F": 15, "G": 16, "H": 17,
  "J": 18, "K": 19, "M": 20, "N": 21, "P": 22, "Q": 23, "R": 24, "S": 25,
  "T": 26, "V": 27, "W": 28, "X": 29, "Y": 30, "Z": 31,
};

function ulidToDate(ulid: string): Date | null {
  try {
    const timeChars = ulid.slice(0, 10).toUpperCase();
    let timestamp = 0;
    for (const char of timeChars) {
      const val = CROCKFORD_DECODE[char];
      if (val === undefined) return null;
      timestamp = timestamp * 32 + val;
    }
    return new Date(timestamp);
  } catch {
    return null;
  }
}

// ============================================================================
// REPO MANAGEMENT
// ============================================================================

/**
 * Upsert a repo record.
 */
export async function upsertRepo(
  fullName: string,
  userId: string,
  owner: string,
  repo: string,
  defaultBranch: string
) {
  const id = crypto.randomUUID();

  await db
    .insert(schema.repos)
    .values({
      id,
      userId,
      owner,
      repo,
      fullName,
      defaultBranch,
      syncStatus: "idle",
    })
    .onConflictDoUpdate({
      target: schema.repos.fullName,
      set: {
        userId,
        defaultBranch,
        updatedAt: now(),
      },
    });
}

/**
 * Set sync error state.
 */
export async function setSyncError(fullName: string, errorCode: string, errorMessage: string) {
  await db
    .update(schema.repos)
    .set({
      syncStatus: "error",
      syncError: `${errorCode}: ${errorMessage}`,
      updatedAt: now(),
    })
    .where(eq(schema.repos.fullName, fullName));
}

/**
 * Get repo by full name.
 */
export async function getRepo(fullName: string) {
  return db.query.repos.findFirst({
    where: eq(schema.repos.fullName, fullName),
  });
}

/**
 * Check if a repo is connected.
 */
export async function isRepoConnected(fullName: string) {
  const repo = await getRepo(fullName);
  return !!repo;
}

// ============================================================================
// BLOB CACHE
// ============================================================================

/**
 * Upsert a raw blob into the cache.
 */
export async function upsertBlob(
  repoFullName: string,
  path: string,
  sha: string,
  contentText: string
) {
  await db
    .insert(schema.repoBlobs)
    .values({
      repoFullName,
      path,
      sha,
      contentText,
      fetchedAt: now(),
    })
    .onConflictDoUpdate({
      target: [schema.repoBlobs.repoFullName, schema.repoBlobs.path],
      set: {
        sha,
        contentText,
        fetchedAt: now(),
      },
    });
}

/**
 * Get cached blob.
 */
export async function getCachedBlob(repoFullName: string, path: string) {
  return db.query.repoBlobs.findFirst({
    where: and(
      eq(schema.repoBlobs.repoFullName, repoFullName),
      eq(schema.repoBlobs.path, path)
    ),
  });
}

// ============================================================================
// TICKETS
// ============================================================================

/**
 * Upsert a ticket from an index.json entry.
 */
export async function upsertTicketFromIndexEntry(
  repoFullName: string,
  indexSha: string,
  headSha: string | null,
  e: {
    id: string;
    short_id?: string;
    display_id?: string;
    title?: string;
    state?: string;
    priority?: string;
    labels?: string[];
    assignee?: string | null;
    reviewer?: string | null;
    path?: string;
  }
) {
  const id = String(e.id).toUpperCase();
  const shortId = String(e.short_id ?? id.slice(0, 8)).toUpperCase();
  const displayId = String(e.display_id ?? `TK-${shortId}`).toUpperCase();
  const createdAt = ulidToDate(id);

  await db
    .insert(schema.tickets)
    .values({
      repoFullName,
      id,
      shortId,
      displayId,
      title: String(e.title ?? ""),
      state: String(e.state ?? "").toLowerCase(),
      priority: String(e.priority ?? "").toLowerCase(),
      labels: Array.isArray(e.labels) ? e.labels : [],
      assignee: e.assignee ?? null,
      reviewer: e.reviewer ?? null,
      path: String(e.path ?? `.tickets/tickets/${id}.md`),
      createdAt,
      headSha,
      indexSha,
      cachedAt: now(),
    })
    .onConflictDoUpdate({
      target: [schema.tickets.repoFullName, schema.tickets.id],
      set: {
        title: String(e.title ?? ""),
        state: String(e.state ?? "").toLowerCase(),
        priority: String(e.priority ?? "").toLowerCase(),
        labels: Array.isArray(e.labels) ? e.labels : [],
        assignee: e.assignee ?? null,
        reviewer: e.reviewer ?? null,
        path: String(e.path ?? `.tickets/tickets/${id}.md`),
        headSha,
        indexSha,
        cachedAt: now(),
      },
    });
}

/**
 * Delete tickets no longer in the index.
 */
export async function deleteTicketsNotInIndex(repoFullName: string, ticketIds: string[]) {
  if (ticketIds.length === 0) {
    // Delete all tickets for this repo
    await db.delete(schema.tickets).where(eq(schema.tickets.repoFullName, repoFullName));
  } else {
    await db
      .delete(schema.tickets)
      .where(
        and(
          eq(schema.tickets.repoFullName, repoFullName),
          notInArray(schema.tickets.id, ticketIds)
        )
      );
  }
}

/**
 * Get cached tickets for a repo.
 */
export async function getCachedTickets(repoFullName: string) {
  return db.query.tickets.findMany({
    where: eq(schema.tickets.repoFullName, repoFullName),
    orderBy: (t, { asc }) => [asc(t.state), asc(t.priority), asc(t.id)],
  });
}

// ============================================================================
// SYNC JOB
// ============================================================================

interface SyncResult {
  success: boolean;
  changed: boolean;
  ticketCount?: number;
  indexSha?: string;
  error?: string;
  errorCode?: string;
}

interface IndexJson {
  format_version: number;
  tickets: Array<{
    id: string;
    short_id?: string;
    display_id?: string;
    title?: string;
    state?: string;
    priority?: string;
    labels?: string[];
    assignee?: string | null;
    reviewer?: string | null;
    path?: string;
  }>;
}

/**
 * SHA-first incremental sync.
 * 
 * 1. Set sync_status=syncing
 * 2. Fetch index.json from GitHub
 * 3. Compare SHA - if unchanged, stop early
 * 4. Parse and upsert tickets
 * 5. Delete tickets no longer in index
 * 6. Update sync metadata
 */
export async function syncRepo(
  fullName: string,
  token: string,
  force = false
): Promise<SyncResult> {
  const [owner, repo] = fullName.split("/");

  // 0) Set sync_status=syncing
  await db
    .update(schema.repos)
    .set({ syncStatus: "syncing", syncError: null, updatedAt: now() })
    .where(eq(schema.repos.fullName, fullName));

  try {
    // 1) Fetch repo metadata (default branch)
    const repoInfoRes = await fetch(`https://api.github.com/repos/${fullName}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });

    if (!repoInfoRes.ok) {
      await setSyncError(fullName, "repo_fetch_failed", `GitHub API error: ${repoInfoRes.status}`);
      return { success: false, changed: false, error: "Failed to fetch repo info", errorCode: "repo_fetch_failed" };
    }

    const repoInfo = await repoInfoRes.json() as { default_branch: string };
    const defaultBranch = repoInfo.default_branch;

    // Get user ID for upsert
    const userRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
    const user = userRes.ok ? await userRes.json() as { id: number } : { id: 0 };

    // Upsert repo row
    await upsertRepo(fullName, String(user.id), owner, repo, defaultBranch);

    // 2) Get HEAD sha of default branch
    const refRes = await fetch(
      `https://api.github.com/repos/${fullName}/git/ref/heads/${defaultBranch}`,
      {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
      }
    );
    const headSha = refRes.ok
      ? ((await refRes.json()) as { object: { sha: string } }).object.sha
      : null;

    // 3) Fetch .tickets/index.json
    const indexRes = await fetch(
      `https://api.github.com/repos/${fullName}/contents/.tickets/index.json?ref=${defaultBranch}`,
      {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
      }
    );

    if (!indexRes.ok) {
      if (indexRes.status === 404) {
        await setSyncError(fullName, "index_missing", "index.json missing. Run `ticket rebuild-index` and push.");
        return { success: false, changed: false, error: "index.json missing", errorCode: "index_missing" };
      }
      await setSyncError(fullName, "index_fetch_failed", `GitHub API error: ${indexRes.status}`);
      return { success: false, changed: false, error: `GitHub API error: ${indexRes.status}`, errorCode: "index_fetch_failed" };
    }

    const indexData = await indexRes.json() as { sha: string; content: string };
    const indexSha = indexData.sha;
    const rawIndex = Buffer.from(indexData.content, "base64").toString("utf-8");

    // 4) If not forced and sha unchanged, stop early
    const repoRow = await getRepo(fullName);
    const lastIndexSha = repoRow?.lastIndexSha ?? null;

    if (!force && lastIndexSha && lastIndexSha === indexSha) {
      // Update sync metadata and stop
      await db
        .update(schema.repos)
        .set({
          defaultBranch,
          headSha: headSha,
          lastSeenHeadSha: headSha,
          lastIndexSha: indexSha,
          lastSyncedAt: now(),
          syncStatus: "idle",
          updatedAt: now(),
        })
        .where(eq(schema.repos.fullName, fullName));

      // Also update blob cache
      await upsertBlob(fullName, ".tickets/index.json", indexSha, rawIndex);

      return { success: true, changed: false, indexSha };
    }

    // 5) Parse index.json
    let idx: IndexJson;
    try {
      idx = JSON.parse(rawIndex);
    } catch {
      await setSyncError(fullName, "index_invalid_format", "index.json invalid JSON. Run `ticket rebuild-index` and push.");
      return { success: false, changed: false, error: "index.json invalid JSON", errorCode: "index_invalid_format" };
    }

    if (idx.format_version !== 1 || !Array.isArray(idx.tickets)) {
      await setSyncError(fullName, "index_invalid_format", "index.json envelope invalid.");
      return { success: false, changed: false, error: "index.json envelope invalid", errorCode: "index_invalid_format" };
    }

    // 6) Upsert raw blob cache
    await upsertBlob(fullName, ".tickets/index.json", indexSha, rawIndex);

    // 7) Upsert tickets table from index entries
    const entries = idx.tickets;
    const idsInIndex = entries.map((e) => String(e.id).toUpperCase());

    for (const e of entries) {
      await upsertTicketFromIndexEntry(fullName, indexSha, headSha, e);
    }

    // 8) Delete tickets no longer in index
    await deleteTicketsNotInIndex(fullName, idsInIndex);

    // 9) Update repo sync metadata
    await db
      .update(schema.repos)
      .set({
        defaultBranch,
        headSha: headSha,
        lastSeenHeadSha: headSha,
        lastIndexSha: indexSha,
        lastSyncedAt: now(),
        syncStatus: "idle",
        syncError: null,
        updatedAt: now(),
      })
      .where(eq(schema.repos.fullName, fullName));

    return { success: true, changed: true, ticketCount: entries.length, indexSha };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    await setSyncError(fullName, "sync_failed", message);
    return { success: false, changed: false, error: message, errorCode: "sync_failed" };
  }
}

// ============================================================================
// PENDING CHANGES
// ============================================================================

/**
 * Get pending changes for a repo (non-terminal statuses).
 */
export async function getPendingChanges(repoFullName: string) {
  return db.query.pendingChanges.findMany({
    where: and(
      eq(schema.pendingChanges.repoFullName, repoFullName),
      notInArray(schema.pendingChanges.status, ["merged", "closed", "failed"])
    ),
  });
}

/**
 * Create a pending change record.
 */
export async function createPendingChange(data: {
  repoFullName: string;
  ticketId: string;
  prNumber: number;
  prUrl: string;
  branch: string;
  status?: string;
}) {
  const id = crypto.randomUUID();

  await db.insert(schema.pendingChanges).values({
    id,
    repoFullName: data.repoFullName,
    ticketId: data.ticketId,
    prNumber: data.prNumber,
    prUrl: data.prUrl,
    branch: data.branch,
    status: data.status ?? "pending_checks",
  });

  return id;
}

/**
 * Update pending change status.
 */
export async function updatePendingChangeStatus(
  repoFullName: string,
  prNumber: number,
  status: string,
  errorCode?: string,
  errorMessage?: string
) {
  await db
    .update(schema.pendingChanges)
    .set({
      status,
      errorCode: errorCode ?? null,
      errorMessage: errorMessage ?? null,
      updatedAt: now(),
    })
    .where(
      and(
        eq(schema.pendingChanges.repoFullName, repoFullName),
        eq(schema.pendingChanges.prNumber, prNumber)
      )
    );
}

/**
 * Reconcile pending changes by checking PR status.
 */
export async function reconcilePendingChanges(repoFullName: string, token: string) {
  const pending = await getPendingChanges(repoFullName);

  for (const p of pending) {
    try {
      const prRes = await fetch(
        `https://api.github.com/repos/${repoFullName}/pulls/${p.prNumber}`,
        {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
        }
      );

      if (!prRes.ok) continue;

      const pr = await prRes.json() as {
        merged: boolean;
        state: string;
        mergeable_state: string | null;
      };

      if (pr.merged) {
        await updatePendingChangeStatus(repoFullName, p.prNumber, "merged");
        continue;
      }

      if (pr.state === "closed") {
        await updatePendingChangeStatus(repoFullName, p.prNumber, "closed");
        continue;
      }

      // Map mergeable_state to our status
      const mergeableState = pr.mergeable_state ?? null;
      const status =
        mergeableState === "dirty"
          ? "conflict"
          : mergeableState === "blocked"
          ? "waiting_review"
          : mergeableState === "clean"
          ? "mergeable"
          : "pending_checks";

      await updatePendingChangeStatus(repoFullName, p.prNumber, status);
    } catch {
      // Skip on error
    }
  }
}
