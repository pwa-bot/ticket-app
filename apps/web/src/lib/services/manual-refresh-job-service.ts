import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { syncRepo } from "@/db/sync";

export type RefreshJobStatus = "queued" | "running" | "succeeded" | "failed";

export interface RefreshJobRecord {
  id: string;
  repoId: string;
  repoFullName: string;
  requestedByUserId: string;
  force: boolean;
  status: RefreshJobStatus;
  attempts: number;
  maxAttempts: number;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RefreshRepoRecord {
  id: string;
  fullName: string;
  installationId: number | null;
}

interface SyncResult {
  success: boolean;
  indexSha?: string;
  error?: string;
  errorCode?: string;
}

export interface ManualRefreshStore {
  findRepoByFullName(fullName: string): Promise<RefreshRepoRecord | null>;
  findActiveJobForRepo(repoId: string): Promise<RefreshJobRecord | null>;
  insertQueuedJob(input: {
    id: string;
    repoId: string;
    repoFullName: string;
    requestedByUserId: string;
    force: boolean;
    maxAttempts: number;
    now: Date;
  }): Promise<RefreshJobRecord>;
  markRepoQueued(repoId: string, now: Date): Promise<void>;
  claimQueuedJobs(limit: number, now: Date): Promise<RefreshJobRecord[]>;
  markRepoSyncing(repoId: string, now: Date): Promise<void>;
  markRepoSyncSuccess(repoId: string, now: Date, headSha: string | null): Promise<void>;
  markRepoSyncError(repoId: string, now: Date, errorCode: string, errorMessage: string): Promise<void>;
  markJobSucceeded(jobId: string, now: Date): Promise<void>;
  markJobFailed(jobId: string, now: Date, errorCode: string, errorMessage: string): Promise<void>;
  requeueJob(jobId: string, now: Date, errorCode: string, errorMessage: string): Promise<void>;
  getInstallationToken(installationId: number): Promise<string>;
  runSync(fullName: string, token: string, force: boolean): Promise<SyncResult>;
  findRepoById(repoId: string): Promise<RefreshRepoRecord | null>;
}

export interface EnqueueRefreshInput {
  repoFullName: string;
  requestedByUserId: string;
  force?: boolean;
  maxAttempts?: number;
}

export interface EnqueueRefreshResult {
  enqueued: boolean;
  job: RefreshJobRecord;
}

export interface ProcessRefreshResult {
  claimed: number;
  succeeded: number;
  failed: number;
  requeued: number;
}

export function createManualRefreshJobService(options: {
  store: ManualRefreshStore;
  now?: () => Date;
  generateId?: () => string;
}) {
  const now = options.now ?? (() => new Date());
  const generateId = options.generateId ?? (() => crypto.randomUUID());
  const { store } = options;

  async function enqueueRefresh(input: EnqueueRefreshInput): Promise<EnqueueRefreshResult> {
    const repo = await store.findRepoByFullName(input.repoFullName);
    if (!repo) {
      throw new Error("repo_not_found");
    }

    const existing = await store.findActiveJobForRepo(repo.id);
    if (existing) {
      return { enqueued: false, job: existing };
    }

    const timestamp = now();
    const job = await store.insertQueuedJob({
      id: generateId(),
      repoId: repo.id,
      repoFullName: repo.fullName,
      requestedByUserId: input.requestedByUserId,
      force: input.force ?? true,
      maxAttempts: input.maxAttempts ?? 3,
      now: timestamp,
    });

    await store.markRepoQueued(repo.id, timestamp);

    return { enqueued: true, job };
  }

  async function processQueuedJobs(limit = 5): Promise<ProcessRefreshResult> {
    const startedAt = now();
    const jobs = await store.claimQueuedJobs(limit, startedAt);

    let succeeded = 0;
    let failed = 0;
    let requeued = 0;

    for (const job of jobs) {
      const repo = await store.findRepoById(job.repoId);
      if (!repo) {
        failed += 1;
        await store.markJobFailed(job.id, now(), "repo_not_found", "Repo not found for refresh job");
        continue;
      }

      if (!repo.installationId) {
        failed += 1;
        await store.markJobFailed(job.id, now(), "installation_missing", "Repo is not linked to a GitHub App installation");
        await store.markRepoSyncError(repo.id, now(), "installation_missing", "Repo is not linked to an installation");
        continue;
      }

      try {
        await store.markRepoSyncing(repo.id, now());
        const token = await store.getInstallationToken(repo.installationId);
        const result = await store.runSync(repo.fullName, token, job.force);

        if (result.success) {
          succeeded += 1;
          await store.markJobSucceeded(job.id, now());
          await store.markRepoSyncSuccess(repo.id, now(), result.indexSha ?? null);
          continue;
        }

        const errorCode = result.errorCode ?? "sync_failed";
        const errorMessage = result.error ?? "Sync failed";
        if (job.attempts >= job.maxAttempts) {
          failed += 1;
          await store.markJobFailed(job.id, now(), errorCode, errorMessage);
          await store.markRepoSyncError(repo.id, now(), errorCode, errorMessage);
        } else {
          requeued += 1;
          await store.requeueJob(job.id, now(), errorCode, errorMessage);
          await store.markRepoSyncError(repo.id, now(), errorCode, errorMessage);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Sync failed";
        const errorCode = "sync_exception";
        if (job.attempts >= job.maxAttempts) {
          failed += 1;
          await store.markJobFailed(job.id, now(), errorCode, errorMessage);
          await store.markRepoSyncError(repo.id, now(), errorCode, errorMessage);
        } else {
          requeued += 1;
          await store.requeueJob(job.id, now(), errorCode, errorMessage);
          await store.markRepoSyncError(repo.id, now(), errorCode, errorMessage);
        }
      }
    }

    return {
      claimed: jobs.length,
      succeeded,
      failed,
      requeued,
    };
  }

  return {
    enqueueRefresh,
    processQueuedJobs,
  };
}

function mapJob(row: typeof schema.manualRefreshJobs.$inferSelect): RefreshJobRecord {
  return {
    id: row.id,
    repoId: row.repoId,
    repoFullName: row.repoFullName,
    requestedByUserId: row.requestedByUserId,
    force: row.force,
    status: row.status as RefreshJobStatus,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapRepo(row: typeof schema.repos.$inferSelect): RefreshRepoRecord {
  return {
    id: row.id,
    fullName: row.fullName,
    installationId: row.installationId ?? null,
  };
}

export function createDbManualRefreshStore(): ManualRefreshStore {
  return {
    async findRepoByFullName(fullName) {
      const repo = await db.query.repos.findFirst({ where: eq(schema.repos.fullName, fullName) });
      return repo ? mapRepo(repo) : null;
    },

    async findActiveJobForRepo(repoId) {
      const row = await db.query.manualRefreshJobs.findFirst({
        where: and(
          eq(schema.manualRefreshJobs.repoId, repoId),
          inArray(schema.manualRefreshJobs.status, ["queued", "running"]),
        ),
        orderBy: [asc(schema.manualRefreshJobs.createdAt)],
      });
      return row ? mapJob(row) : null;
    },

    async insertQueuedJob(input) {
      const [row] = await db
        .insert(schema.manualRefreshJobs)
        .values({
          id: input.id,
          repoId: input.repoId,
          repoFullName: input.repoFullName,
          requestedByUserId: input.requestedByUserId,
          force: input.force,
          status: "queued",
          attempts: 0,
          maxAttempts: input.maxAttempts,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .returning();

      if (!row || row.length === 0) {
        throw new Error("Failed to insert job");
      }
      
      const insertedRow = row[0] as typeof schema.manualRefreshJobs.$inferSelect;
      if (!insertedRow) {
        throw new Error("Failed to insert job");
      }
      
      return mapJob(insertedRow);
    },

    async markRepoQueued(repoId, nowTs) {
      await db
        .update(schema.repos)
        .set({
          syncStatus: "syncing",
          syncError: null,
          updatedAt: nowTs,
        })
        .where(eq(schema.repos.id, repoId));

      await db
        .insert(schema.repoSyncState)
        .values({ repoId, status: "syncing", errorCode: null, errorMessage: null })
        .onConflictDoUpdate({
          target: schema.repoSyncState.repoId,
          set: {
            status: "syncing",
            errorCode: null,
            errorMessage: null,
          },
        });
    },

    async claimQueuedJobs(limit, nowTs) {
      const queued = await db.query.manualRefreshJobs.findMany({
        where: eq(schema.manualRefreshJobs.status, "queued"),
        orderBy: [asc(schema.manualRefreshJobs.createdAt)],
        limit,
      });

      const claimed: RefreshJobRecord[] = [];
      for (const row of queued) {
        const [updated] = await db
          .update(schema.manualRefreshJobs)
          .set({
            status: "running",
            attempts: sql`${schema.manualRefreshJobs.attempts} + 1`,
            startedAt: nowTs,
            updatedAt: nowTs,
          })
          .where(and(eq(schema.manualRefreshJobs.id, row.id), eq(schema.manualRefreshJobs.status, "queued")))
          .returning();

        if (Array.isArray(updated) && updated.length > 0) {
          claimed.push(mapJob(updated[0] as typeof schema.manualRefreshJobs.$inferSelect));
        }
      }

      return claimed;
    },

    async markRepoSyncing(repoId, nowTs) {
      await db
        .update(schema.repos)
        .set({
          syncStatus: "syncing",
          syncError: null,
          updatedAt: nowTs,
        })
        .where(eq(schema.repos.id, repoId));

      await db
        .insert(schema.repoSyncState)
        .values({
          repoId,
          status: "syncing",
          errorCode: null,
          errorMessage: null,
        })
        .onConflictDoUpdate({
          target: schema.repoSyncState.repoId,
          set: {
            status: "syncing",
            errorCode: null,
            errorMessage: null,
          },
        });
    },

    async markRepoSyncSuccess(repoId, nowTs, headSha) {
      await db
        .update(schema.repos)
        .set({
          syncStatus: "idle",
          syncError: null,
          lastSyncedAt: nowTs,
          headSha,
          updatedAt: nowTs,
        })
        .where(eq(schema.repos.id, repoId));

      await db
        .insert(schema.repoSyncState)
        .values({
          repoId,
          status: "ok",
          lastSyncedAt: nowTs,
          headSha,
          errorCode: null,
          errorMessage: null,
        })
        .onConflictDoUpdate({
          target: schema.repoSyncState.repoId,
          set: {
            status: "ok",
            lastSyncedAt: nowTs,
            headSha,
            errorCode: null,
            errorMessage: null,
          },
        });
    },

    async markRepoSyncError(repoId, nowTs, errorCode, errorMessage) {
      await db
        .update(schema.repos)
        .set({
          syncStatus: "error",
          syncError: `${errorCode}: ${errorMessage}`,
          updatedAt: nowTs,
        })
        .where(eq(schema.repos.id, repoId));

      await db
        .insert(schema.repoSyncState)
        .values({
          repoId,
          status: "error",
          errorCode,
          errorMessage,
        })
        .onConflictDoUpdate({
          target: schema.repoSyncState.repoId,
          set: {
            status: "error",
            errorCode,
            errorMessage,
          },
        });
    },

    async markJobSucceeded(jobId, nowTs) {
      await db
        .update(schema.manualRefreshJobs)
        .set({
          status: "succeeded",
          completedAt: nowTs,
          errorCode: null,
          errorMessage: null,
          updatedAt: nowTs,
        })
        .where(eq(schema.manualRefreshJobs.id, jobId));
    },

    async markJobFailed(jobId, nowTs, errorCode, errorMessage) {
      await db
        .update(schema.manualRefreshJobs)
        .set({
          status: "failed",
          completedAt: nowTs,
          errorCode,
          errorMessage,
          updatedAt: nowTs,
        })
        .where(eq(schema.manualRefreshJobs.id, jobId));
    },

    async requeueJob(jobId, nowTs, errorCode, errorMessage) {
      await db
        .update(schema.manualRefreshJobs)
        .set({
          status: "queued",
          errorCode,
          errorMessage,
          updatedAt: nowTs,
        })
        .where(eq(schema.manualRefreshJobs.id, jobId));
    },

    async getInstallationToken(installationId) {
      const { getInstallationOctokit } = await import("@/lib/github-app");
      const octokit = getInstallationOctokit(installationId);
      const auth = (await octokit.auth({ type: "installation" })) as { token: string };
      return auth.token;
    },

    async runSync(fullName, token, force) {
      return syncRepo(fullName, token, force);
    },

    async findRepoById(repoId) {
      const repo = await db.query.repos.findFirst({ where: eq(schema.repos.id, repoId) });
      return repo ? mapRepo(repo) : null;
    },
  };
}

export function getManualRefreshJobService() {
  return createManualRefreshJobService({
    store: createDbManualRefreshStore(),
  });
}
