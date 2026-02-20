import assert from "node:assert/strict";
import test from "node:test";
import { db } from "@/db/client";
import {
  createDbManualRefreshStore,
  getFirstReturningRow,
} from "../manual-refresh-job-service";

test("getFirstReturningRow returns first row", () => {
  const row = getFirstReturningRow([{ id: "job-1" }, { id: "job-2" }], "insert job");
  assert.equal(row.id, "job-1");
});

test("getFirstReturningRow throws when returning rows are empty", () => {
  assert.throws(() => getFirstReturningRow([], "insert job"), /Failed to insert job/);
});

test("createDbManualRefreshStore.insertQueuedJob maps first returning row", async () => {
  const originalInsert = db.insert;

  const now = new Date("2026-02-20T12:00:00.000Z");
  const insertedRow = {
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
    createdAt: now,
    updatedAt: now,
  };

  db.insert = (() => ({
    values: () => ({
      returning: async () => [insertedRow],
    }),
  })) as typeof db.insert;

  try {
    const store = createDbManualRefreshStore();
    const job = await store.insertQueuedJob({
      id: "job-1",
      repoId: "repo-1",
      repoFullName: "acme/repo",
      requestedByUserId: "user-1",
      force: true,
      maxAttempts: 3,
      now,
    });

    assert.equal(job.id, "job-1");
    assert.equal(job.status, "queued");
  } finally {
    db.insert = originalInsert;
  }
});

test("createDbManualRefreshStore.claimQueuedJobs claims rows returned from update().returning()", async () => {
  const originalUpdate = db.update;
  const originalQuery = Object.getOwnPropertyDescriptor(db, "query");

  const queuedRow = {
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
    createdAt: new Date("2026-02-20T12:00:00.000Z"),
    updatedAt: new Date("2026-02-20T12:00:00.000Z"),
  };

  const claimedRow = {
    ...queuedRow,
    status: "running",
    attempts: 1,
    startedAt: new Date("2026-02-20T12:01:00.000Z"),
    updatedAt: new Date("2026-02-20T12:01:00.000Z"),
  };

  Object.defineProperty(db, "query", {
    configurable: true,
    get() {
      return {
        manualRefreshJobs: {
          findMany: async () => [queuedRow],
        },
      };
    },
  });

  db.update = (() => ({
    set: () => ({
      where: () => ({
        returning: async () => [claimedRow],
      }),
    }),
  })) as typeof db.update;

  try {
    const store = createDbManualRefreshStore();
    const claimed = await store.claimQueuedJobs(5, new Date("2026-02-20T12:01:00.000Z"));

    assert.equal(claimed.length, 1);
    assert.equal(claimed[0]?.id, "job-1");
    assert.equal(claimed[0]?.status, "running");
  } finally {
    db.update = originalUpdate;
    if (originalQuery) {
      Object.defineProperty(db, "query", originalQuery);
    }
  }
});
