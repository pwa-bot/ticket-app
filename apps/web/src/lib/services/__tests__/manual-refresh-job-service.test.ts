import assert from "node:assert/strict";
import test from "node:test";
import {
  computeRetryBackoff,
  createManualRefreshJobService,
  RefreshQuotaExceededError,
  type ManualRefreshStore,
  type RefreshJobRecord,
  type RefreshRepoRecord,
} from "../manual-refresh-job-service";

function createInMemoryStore(seed?: {
  repos?: RefreshRepoRecord[];
  jobs?: RefreshJobRecord[];
  syncResult?: { success: boolean; indexSha?: string; error?: string; errorCode?: string };
}) {
  const repos = new Map<string, RefreshRepoRecord>();
  const reposById = new Map<string, RefreshRepoRecord>();
  for (const repo of seed?.repos ?? [{ id: "repo-1", fullName: "acme/repo", installationId: 42 }]) {
    repos.set(repo.fullName, repo);
    reposById.set(repo.id, repo);
  }

  const jobs = new Map<string, RefreshJobRecord>();
  for (const job of seed?.jobs ?? []) {
    jobs.set(job.id, job);
  }

  const repoSyncErrors = new Map<string, string>();

  const store: ManualRefreshStore = {
    async findRepoByFullName(fullName) {
      return repos.get(fullName) ?? null;
    },

    async findActiveJobForRepo(repoId) {
      return Array.from(jobs.values()).find((job) => job.repoId === repoId && (job.status === "queued" || job.status === "running")) ?? null;
    },

    async getRefreshQuotaSnapshot({ repoId, requestedByUserId, windowStart }) {
      const userWindow = Array.from(jobs.values()).filter(
        (job) => job.requestedByUserId === requestedByUserId && job.createdAt.getTime() >= windowStart.getTime(),
      );
      const repoWindow = Array.from(jobs.values()).filter(
        (job) => job.repoId === repoId && job.createdAt.getTime() >= windowStart.getTime(),
      );
      const oldestUserCreatedAt = userWindow.reduce<Date | null>((oldest, job) => {
        if (!oldest) return job.createdAt;
        return job.createdAt.getTime() < oldest.getTime() ? job.createdAt : oldest;
      }, null);
      const oldestRepoCreatedAt = repoWindow.reduce<Date | null>((oldest, job) => {
        if (!oldest) return job.createdAt;
        return job.createdAt.getTime() < oldest.getTime() ? job.createdAt : oldest;
      }, null);

      return {
        userCount: userWindow.length,
        repoCount: repoWindow.length,
        oldestUserCreatedAt,
        oldestRepoCreatedAt,
      };
    },

    async insertQueuedJob(input) {
      const row: RefreshJobRecord = {
        id: input.id,
        repoId: input.repoId,
        repoFullName: input.repoFullName,
        requestedByUserId: input.requestedByUserId,
        force: input.force,
        status: "queued",
        attempts: 0,
        maxAttempts: input.maxAttempts,
        errorCode: null,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
        nextAttemptAt: input.now,
        createdAt: input.now,
        updatedAt: input.now,
      };
      jobs.set(row.id, row);
      return row;
    },

    async markRepoQueued() {
      return;
    },

    async claimQueuedJobs(limit, now) {
      const claimed: RefreshJobRecord[] = [];
      for (const job of Array.from(jobs.values())) {
        if (claimed.length >= limit) break;
        if (job.status !== "queued") continue;
        if (job.nextAttemptAt && job.nextAttemptAt.getTime() > now.getTime()) continue;

        const updated = {
          ...job,
          status: "running" as const,
          attempts: job.attempts + 1,
          startedAt: now,
          updatedAt: now,
        };
        jobs.set(job.id, updated);
        claimed.push(updated);
      }

      return claimed;
    },

    async markRepoSyncing() {
      return;
    },

    async markRepoSyncSuccess() {
      return;
    },

    async markRepoSyncError(repoId, _now, errorCode, errorMessage) {
      repoSyncErrors.set(repoId, `${errorCode}:${errorMessage}`);
    },

    async markJobSucceeded(jobId, now) {
      const current = jobs.get(jobId);
      if (!current) return;
      jobs.set(jobId, {
        ...current,
        status: "succeeded",
        completedAt: now,
        errorCode: null,
        errorMessage: null,
        nextAttemptAt: null,
        updatedAt: now,
      });
    },

    async markJobFailed(jobId, now, errorCode, errorMessage) {
      const current = jobs.get(jobId);
      if (!current) return;
      jobs.set(jobId, {
        ...current,
        status: "failed",
        completedAt: now,
        errorCode,
        errorMessage,
        nextAttemptAt: null,
        updatedAt: now,
      });
    },

    async requeueJob({ jobId, now, nextAttemptAt, errorCode, errorMessage }) {
      const current = jobs.get(jobId);
      if (!current) return;
      jobs.set(jobId, {
        ...current,
        status: "queued",
        nextAttemptAt,
        errorCode,
        errorMessage,
        updatedAt: now,
      });
    },

    async getInstallationToken() {
      return "installation-token";
    },

    async runSync() {
      return seed?.syncResult ?? { success: true, indexSha: "sha-123" };
    },

    async findRepoById(repoId) {
      return reposById.get(repoId) ?? null;
    },
  };

  return {
    store,
    getJobs() {
      return Array.from(jobs.values());
    },
    getRepoSyncError(repoId: string) {
      return repoSyncErrors.get(repoId) ?? null;
    },
  };
}

function buildJob(overrides: Partial<RefreshJobRecord> = {}): RefreshJobRecord {
  return {
    id: overrides.id ?? "job-1",
    repoId: overrides.repoId ?? "repo-1",
    repoFullName: overrides.repoFullName ?? "acme/repo",
    requestedByUserId: overrides.requestedByUserId ?? "user-1",
    force: overrides.force ?? true,
    status: overrides.status ?? "queued",
    attempts: overrides.attempts ?? 0,
    maxAttempts: overrides.maxAttempts ?? 3,
    errorCode: overrides.errorCode ?? null,
    errorMessage: overrides.errorMessage ?? null,
    startedAt: overrides.startedAt ?? null,
    completedAt: overrides.completedAt ?? null,
    nextAttemptAt: overrides.nextAttemptAt ?? new Date("2026-02-20T08:00:00.000Z"),
    createdAt: overrides.createdAt ?? new Date("2026-02-20T08:00:00.000Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-02-20T08:00:00.000Z"),
  };
}

test("computeRetryBackoff doubles until max", () => {
  const now = new Date("2026-02-20T08:00:00.000Z");
  const first = computeRetryBackoff(1, now, { baseMs: 10_000, maxMs: 60_000 });
  const third = computeRetryBackoff(3, now, { baseMs: 10_000, maxMs: 60_000 });
  const tenth = computeRetryBackoff(10, now, { baseMs: 10_000, maxMs: 60_000 });

  assert.equal(first.delayMs, 10_000);
  assert.equal(third.delayMs, 40_000);
  assert.equal(tenth.delayMs, 60_000);
  assert.equal(first.nextAttemptAt.toISOString(), "2026-02-20T08:00:10.000Z");
});

test("enqueueRefresh creates a queued job", async () => {
  const fixture = createInMemoryStore();
  const service = createManualRefreshJobService({
    store: fixture.store,
    generateId: () => "job-1",
    now: () => new Date("2026-02-20T08:00:00.000Z"),
  });

  const result = await service.enqueueRefresh({
    repoFullName: "acme/repo",
    requestedByUserId: "user-1",
  });

  assert.equal(result.enqueued, true);
  assert.equal(result.job.id, "job-1");
  assert.equal(result.job.status, "queued");
});

test("enqueueRefresh dedupes when a queued job already exists", async () => {
  const fixture = createInMemoryStore({
    jobs: [buildJob({ id: "job-1" })],
  });
  const service = createManualRefreshJobService({
    store: fixture.store,
    generateId: () => "job-2",
    now: () => new Date("2026-02-20T08:01:00.000Z"),
  });

  const result = await service.enqueueRefresh({
    repoFullName: "acme/repo",
    requestedByUserId: "user-2",
  });

  assert.equal(result.enqueued, false);
  assert.equal(result.job.id, "job-1");
  assert.equal(fixture.getJobs().length, 1);
});

test("enqueueRefresh enforces per-user quota", async () => {
  const fixture = createInMemoryStore({
    jobs: [
      buildJob({ id: "job-1", requestedByUserId: "user-1", status: "succeeded", createdAt: new Date("2026-02-20T08:00:00.000Z") }),
      buildJob({ id: "job-2", requestedByUserId: "user-1", status: "failed", createdAt: new Date("2026-02-20T08:05:00.000Z") }),
    ],
  });

  const service = createManualRefreshJobService({
    store: fixture.store,
    quotas: { userLimit: 2, repoLimit: 10, windowMs: 15 * 60 * 1000 },
    generateId: () => "job-3",
    now: () => new Date("2026-02-20T08:10:00.000Z"),
  });

  await assert.rejects(
    () =>
      service.enqueueRefresh({
        repoFullName: "acme/repo",
        requestedByUserId: "user-1",
      }),
    (error: unknown) => {
      assert.equal(error instanceof RefreshQuotaExceededError, true);
      const quotaError = error as RefreshQuotaExceededError;
      assert.equal(quotaError.scope, "user");
      assert.equal(quotaError.retryAfterSeconds, 300);
      return true;
    },
  );
});

test("enqueueRefresh enforces per-repo quota", async () => {
  const fixture = createInMemoryStore({
    jobs: [
      buildJob({ id: "job-1", requestedByUserId: "user-1", status: "succeeded", createdAt: new Date("2026-02-20T08:03:00.000Z") }),
      buildJob({ id: "job-2", requestedByUserId: "user-2", status: "failed", createdAt: new Date("2026-02-20T08:04:00.000Z") }),
    ],
  });

  const service = createManualRefreshJobService({
    store: fixture.store,
    quotas: { userLimit: 10, repoLimit: 2, windowMs: 15 * 60 * 1000 },
    generateId: () => "job-3",
    now: () => new Date("2026-02-20T08:10:00.000Z"),
  });

  await assert.rejects(
    () =>
      service.enqueueRefresh({
        repoFullName: "acme/repo",
        requestedByUserId: "user-3",
      }),
    (error: unknown) => {
      assert.equal(error instanceof RefreshQuotaExceededError, true);
      const quotaError = error as RefreshQuotaExceededError;
      assert.equal(quotaError.scope, "repo");
      assert.equal(quotaError.retryAfterSeconds, 480);
      return true;
    },
  );
});

test("enqueueRefresh allows requests once quota window elapses", async () => {
  const fixture = createInMemoryStore({
    jobs: [
      buildJob({
        id: "job-1",
        requestedByUserId: "user-1",
        status: "succeeded",
        createdAt: new Date("2026-02-20T07:00:00.000Z"),
        nextAttemptAt: new Date("2026-02-20T07:00:00.000Z"),
      }),
    ],
  });

  const service = createManualRefreshJobService({
    store: fixture.store,
    quotas: { userLimit: 1, repoLimit: 5, windowMs: 15 * 60 * 1000 },
    generateId: () => "job-2",
    now: () => new Date("2026-02-20T08:00:00.000Z"),
  });

  const result = await service.enqueueRefresh({
    repoFullName: "acme/repo",
    requestedByUserId: "user-1",
  });

  assert.equal(result.enqueued, true);
  assert.equal(result.job.id, "job-2");
});

test("processQueuedJobs marks success when sync succeeds", async () => {
  const fixture = createInMemoryStore({
    jobs: [buildJob({ id: "job-1", nextAttemptAt: new Date("2026-02-20T08:00:00.000Z") })],
    syncResult: { success: true, indexSha: "sha-123" },
  });

  const service = createManualRefreshJobService({
    store: fixture.store,
    now: () => new Date("2026-02-20T08:05:00.000Z"),
  });

  const result = await service.processQueuedJobs(5);
  const [job] = fixture.getJobs();

  assert.equal(result.claimed, 1);
  assert.equal(result.succeeded, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.requeued, 0);
  assert.equal(job?.status, "succeeded");
  assert.equal(job?.attempts, 1);
});

test("processQueuedJobs requeues on sync failure before max attempts with backoff", async () => {
  const fixture = createInMemoryStore({
    jobs: [buildJob({ id: "job-1", attempts: 0, nextAttemptAt: new Date("2026-02-20T08:00:00.000Z") })],
    syncResult: { success: false, errorCode: "sync_failed", error: "boom" },
  });

  const service = createManualRefreshJobService({
    store: fixture.store,
    now: () => new Date("2026-02-20T08:10:00.000Z"),
    backoff: { baseMs: 10_000, maxMs: 60_000 },
  });

  const result = await service.processQueuedJobs(5);
  const [job] = fixture.getJobs();

  assert.equal(result.succeeded, 0);
  assert.equal(result.failed, 0);
  assert.equal(result.requeued, 1);
  assert.equal(job?.status, "queued");
  assert.equal(job?.attempts, 1);
  assert.equal(job?.errorCode, "sync_failed");
  assert.equal(job?.nextAttemptAt?.toISOString(), "2026-02-20T08:10:10.000Z");
  assert.equal(fixture.getRepoSyncError("repo-1"), "sync_failed:boom");
});

test("processQueuedJobs respects nextAttemptAt and skips delayed jobs", async () => {
  const fixture = createInMemoryStore({
    jobs: [
      buildJob({
        id: "job-1",
        nextAttemptAt: new Date("2026-02-20T08:20:00.000Z"),
      }),
    ],
    syncResult: { success: true, indexSha: "sha-123" },
  });

  const service = createManualRefreshJobService({
    store: fixture.store,
    now: () => new Date("2026-02-20T08:10:00.000Z"),
  });

  const result = await service.processQueuedJobs(5);
  const [job] = fixture.getJobs();

  assert.equal(result.claimed, 0);
  assert.equal(result.succeeded, 0);
  assert.equal(job?.status, "queued");
  assert.equal(job?.attempts, 0);
});

test("processQueuedJobs fails permanently after max attempts", async () => {
  const fixture = createInMemoryStore({
    jobs: [buildJob({ id: "job-1", attempts: 2, maxAttempts: 3, nextAttemptAt: new Date("2026-02-20T08:00:00.000Z") })],
    syncResult: { success: false, errorCode: "sync_failed", error: "boom" },
  });

  const service = createManualRefreshJobService({
    store: fixture.store,
    now: () => new Date("2026-02-20T08:12:00.000Z"),
  });

  const result = await service.processQueuedJobs(5);
  const [job] = fixture.getJobs();

  assert.equal(result.succeeded, 0);
  assert.equal(result.failed, 1);
  assert.equal(result.requeued, 0);
  assert.equal(job?.status, "failed");
  assert.equal(job?.attempts, 3);
  assert.equal(job?.errorCode, "sync_failed");
});
