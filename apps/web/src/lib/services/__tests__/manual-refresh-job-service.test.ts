import assert from "node:assert/strict";
import test from "node:test";
import {
  createManualRefreshJobService,
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
        updatedAt: now,
      });
    },

    async requeueJob(jobId, now, errorCode, errorMessage) {
      const current = jobs.get(jobId);
      if (!current) return;
      jobs.set(jobId, {
        ...current,
        status: "queued",
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
    jobs: [
      {
        id: "job-1",
        repoId: "repo-1",
        repoFullName: "acme/repo",
        requestedByUserId: "user-1",
        force: true,
        status: "queued",
        attempts: 0,
        maxAttempts: 3,
        errorCode: null,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
        createdAt: new Date("2026-02-20T08:00:00.000Z"),
        updatedAt: new Date("2026-02-20T08:00:00.000Z"),
      },
    ],
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

test("processQueuedJobs marks success when sync succeeds", async () => {
  const fixture = createInMemoryStore({
    jobs: [
      {
        id: "job-1",
        repoId: "repo-1",
        repoFullName: "acme/repo",
        requestedByUserId: "user-1",
        force: true,
        status: "queued",
        attempts: 0,
        maxAttempts: 3,
        errorCode: null,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
        createdAt: new Date("2026-02-20T08:00:00.000Z"),
        updatedAt: new Date("2026-02-20T08:00:00.000Z"),
      },
    ],
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
  assert.equal(job.status, "succeeded");
  assert.equal(job.attempts, 1);
});

test("processQueuedJobs requeues on sync failure before max attempts", async () => {
  const fixture = createInMemoryStore({
    jobs: [
      {
        id: "job-1",
        repoId: "repo-1",
        repoFullName: "acme/repo",
        requestedByUserId: "user-1",
        force: true,
        status: "queued",
        attempts: 0,
        maxAttempts: 3,
        errorCode: null,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
        createdAt: new Date("2026-02-20T08:00:00.000Z"),
        updatedAt: new Date("2026-02-20T08:00:00.000Z"),
      },
    ],
    syncResult: { success: false, errorCode: "sync_failed", error: "boom" },
  });

  const service = createManualRefreshJobService({
    store: fixture.store,
    now: () => new Date("2026-02-20T08:10:00.000Z"),
  });

  const result = await service.processQueuedJobs(5);
  const [job] = fixture.getJobs();

  assert.equal(result.succeeded, 0);
  assert.equal(result.failed, 0);
  assert.equal(result.requeued, 1);
  assert.equal(job.status, "queued");
  assert.equal(job.attempts, 1);
  assert.equal(job.errorCode, "sync_failed");
  assert.equal(fixture.getRepoSyncError("repo-1"), "sync_failed:boom");
});

test("processQueuedJobs fails permanently after max attempts", async () => {
  const fixture = createInMemoryStore({
    jobs: [
      {
        id: "job-1",
        repoId: "repo-1",
        repoFullName: "acme/repo",
        requestedByUserId: "user-1",
        force: true,
        status: "queued",
        attempts: 2,
        maxAttempts: 3,
        errorCode: null,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
        createdAt: new Date("2026-02-20T08:00:00.000Z"),
        updatedAt: new Date("2026-02-20T08:00:00.000Z"),
      },
    ],
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
  assert.equal(job.status, "failed");
  assert.equal(job.attempts, 3);
  assert.equal(job.errorCode, "sync_failed");
});
