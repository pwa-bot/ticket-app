import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
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
  nextAttemptAt: Date | null;
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

interface RefreshQuotaSnapshot {
  userCount: number;
  repoCount: number;
  oldestUserCreatedAt: Date | null;
  oldestRepoCreatedAt: Date | null;
}

export interface ManualRefreshStore {
  findRepoByFullName(fullName: string): Promise<RefreshRepoRecord | null>;
  findActiveJobForRepo(repoId: string): Promise<RefreshJobRecord | null>;
  getRefreshQuotaSnapshot(input: {
    repoId: string;
    requestedByUserId: string;
    windowStart: Date;
  }): Promise<RefreshQuotaSnapshot>;
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
  requeueJob(input: {
    jobId: string;
    now: Date;
    nextAttemptAt: Date;
    errorCode: string;
    errorMessage: string;
  }): Promise<void>;
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

interface RefreshQuotaConfig {
  userLimit: number;
  repoLimit: number;
  windowMs: number;
}

interface BackoffConfig {
  baseMs: number;
  maxMs: number;
}

interface RetryBackoffResult {
  delayMs: number;
  nextAttemptAt: Date;
}

export class RefreshQuotaExceededError extends Error {
  readonly scope: "user" | "repo";
  readonly limit: number;
  readonly windowMs: number;
  readonly retryAfterSeconds: number;

  constructor(input: {
    scope: "user" | "repo";
    limit: number;
    windowMs: number;
    retryAfterSeconds: number;
    message: string;
  }) {
    super(input.message);
    this.name = "RefreshQuotaExceededError";
    this.scope = input.scope;
    this.limit = input.limit;
    this.windowMs = input.windowMs;
    this.retryAfterSeconds = input.retryAfterSeconds;
  }
}

function computeRetryAfterSeconds(oldestCreatedAt: Date | null, nowTs: Date, windowMs: number): number {
  if (!oldestCreatedAt) {
    return Math.ceil(windowMs / 1000);
  }

  const retryAt = oldestCreatedAt.getTime() + windowMs;
  return Math.max(1, Math.ceil(Math.max(0, retryAt - nowTs.getTime()) / 1000));
}

export function computeRetryBackoff(attempts: number, nowTs: Date, backoff: BackoffConfig): RetryBackoffResult {
  const normalizedAttempts = Math.max(1, attempts);
  const delayMs = Math.min(backoff.maxMs, backoff.baseMs * 2 ** (normalizedAttempts - 1));
  return {
    delayMs,
    nextAttemptAt: new Date(nowTs.getTime() + delayMs),
  };
}

export function createManualRefreshJobService(options: {
  store: ManualRefreshStore;
  now?: () => Date;
  generateId?: () => string;
  quotas?: Partial<RefreshQuotaConfig>;
  backoff?: Partial<BackoffConfig>;
}) {
  const now = options.now ?? (() => new Date());
  const generateId = options.generateId ?? (() => crypto.randomUUID());
  const quotaConfig: RefreshQuotaConfig = {
    userLimit: options.quotas?.userLimit ?? 10,
    repoLimit: options.quotas?.repoLimit ?? 20,
    windowMs: options.quotas?.windowMs ?? 15 * 60 * 1000,
  };
  const backoffConfig: BackoffConfig = {
    baseMs: options.backoff?.baseMs ?? 15_000,
    maxMs: options.backoff?.maxMs ?? 10 * 60 * 1000,
  };
  const { store } = options;

  async function enforceQuotas(repoId: string, requestedByUserId: string, timestamp: Date): Promise<void> {
    const windowStart = new Date(timestamp.getTime() - quotaConfig.windowMs);
    const snapshot = await store.getRefreshQuotaSnapshot({
      repoId,
      requestedByUserId,
      windowStart,
    });

    if (snapshot.userCount >= quotaConfig.userLimit) {
      throw new RefreshQuotaExceededError({
        scope: "user",
        limit: quotaConfig.userLimit,
        windowMs: quotaConfig.windowMs,
        retryAfterSeconds: computeRetryAfterSeconds(snapshot.oldestUserCreatedAt, timestamp, quotaConfig.windowMs),
        message: "User refresh quota exceeded",
      });
    }

    if (snapshot.repoCount >= quotaConfig.repoLimit) {
      throw new RefreshQuotaExceededError({
        scope: "repo",
        limit: quotaConfig.repoLimit,
        windowMs: quotaConfig.windowMs,
        retryAfterSeconds: computeRetryAfterSeconds(snapshot.oldestRepoCreatedAt, timestamp, quotaConfig.windowMs),
        message: "Repository refresh quota exceeded",
      });
    }
  }

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
    await enforceQuotas(repo.id, input.requestedByUserId, timestamp);

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
          const retry = computeRetryBackoff(job.attempts, now(), backoffConfig);
          await store.requeueJob({
            jobId: job.id,
            now: now(),
            nextAttemptAt: retry.nextAttemptAt,
            errorCode,
            errorMessage,
          });
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
          const retry = computeRetryBackoff(job.attempts, now(), backoffConfig);
          await store.requeueJob({
            jobId: job.id,
            now: now(),
            nextAttemptAt: retry.nextAttemptAt,
            errorCode,
            errorMessage,
          });
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
    nextAttemptAt: row.nextAttemptAt,
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

export function getFirstReturningRow<T>(rows: T[], operation: string): T {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`Failed to ${operation}`);
  }

  const row = rows[0];
  if (!row) {
    throw new Error(`Failed to ${operation}`);
  }

  return row;
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

    async getRefreshQuotaSnapshot({ repoId, requestedByUserId, windowStart }) {
      const [userRows, repoRows] = await Promise.all([
        db
          .select({
            count: sql<number>`count(*)::int`,
            oldestCreatedAt: sql<Date | null>`min(${schema.manualRefreshJobs.createdAt})`,
          })
          .from(schema.manualRefreshJobs)
          .where(
            and(
              eq(schema.manualRefreshJobs.requestedByUserId, requestedByUserId),
              gte(schema.manualRefreshJobs.createdAt, windowStart),
            ),
          ),
        db
          .select({
            count: sql<number>`count(*)::int`,
            oldestCreatedAt: sql<Date | null>`min(${schema.manualRefreshJobs.createdAt})`,
          })
          .from(schema.manualRefreshJobs)
          .where(and(eq(schema.manualRefreshJobs.repoId, repoId), gte(schema.manualRefreshJobs.createdAt, windowStart))),
      ]);

      const userRow = userRows[0];
      const repoRow = repoRows[0];

      return {
        userCount: Number(userRow?.count ?? 0),
        repoCount: Number(repoRow?.count ?? 0),
        oldestUserCreatedAt: userRow?.oldestCreatedAt ?? null,
        oldestRepoCreatedAt: repoRow?.oldestCreatedAt ?? null,
      };
    },

    async insertQueuedJob(input) {
      const rows = (await db
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
          nextAttemptAt: input.now,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .returning()) as typeof schema.manualRefreshJobs.$inferSelect[];

      const insertedRow = getFirstReturningRow(rows, "insert job");
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
        where: and(
          eq(schema.manualRefreshJobs.status, "queued"),
          sql`${schema.manualRefreshJobs.nextAttemptAt} <= ${nowTs}`,
        ),
        orderBy: [asc(schema.manualRefreshJobs.nextAttemptAt), asc(schema.manualRefreshJobs.createdAt)],
        limit,
      });

      const claimed: RefreshJobRecord[] = [];
      for (const row of queued) {
        const updatedRows = (await db
          .update(schema.manualRefreshJobs)
          .set({
            status: "running",
            attempts: sql`${schema.manualRefreshJobs.attempts} + 1`,
            startedAt: nowTs,
            updatedAt: nowTs,
          })
          .where(and(eq(schema.manualRefreshJobs.id, row.id), eq(schema.manualRefreshJobs.status, "queued")))
          .returning()) as typeof schema.manualRefreshJobs.$inferSelect[];

        if (updatedRows.length > 0) {
          claimed.push(mapJob(updatedRows[0] as typeof schema.manualRefreshJobs.$inferSelect));
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
          nextAttemptAt: null,
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
          nextAttemptAt: null,
          updatedAt: nowTs,
        })
        .where(eq(schema.manualRefreshJobs.id, jobId));
    },

    async requeueJob({ jobId, now, nextAttemptAt, errorCode, errorMessage }) {
      await db
        .update(schema.manualRefreshJobs)
        .set({
          status: "queued",
          nextAttemptAt,
          errorCode,
          errorMessage,
          updatedAt: now,
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
