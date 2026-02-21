import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  createGithubWebhookService,
  extractShortIds,
  mapChecksState,
  type GithubContentClient,
  type GithubWebhookSecurityEvent,
  type GithubWebhookSecurityMonitor,
  type GithubWebhookStore,
} from "../github-webhook-service";

const SECRET = "test-secret";

function signBody(body: string, secret: string): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(Buffer.from(body)).digest("hex")}`;
}

function createStoreMock(overrides: Partial<GithubWebhookStore> = {}): GithubWebhookStore {
  return {
    recordDeliveryIfNew: async () => true,
    recordIdempotencyKeyIfNew: async () => true,
    findRepo: async () => ({ id: "repo-1", fullName: "acme/repo", installationId: 11 }),
    findGithubInstallationId: async () => 123,
    tryAcquireRepoSyncLock: async () => true,
    releaseRepoSyncLock: async () => undefined,
    setRepoSyncError: async () => undefined,
    upsertBlob: async () => undefined,
    upsertTicketFromIndexEntry: async () => undefined,
    deleteAllTickets: async () => undefined,
    deleteTicketsNotIn: async () => undefined,
    updateRepoAfterPush: async () => undefined,
    upsertTicketIndexSnapshot: async () => undefined,
    replaceTicketPrMappings: async () => undefined,
    findTicketsByShortIds: async () => [],
    upsertTicketPr: async () => undefined,
    updateTicketPrChecks: async () => undefined,
    ...overrides,
  };
}

function createGithubMock(overrides: Partial<GithubContentClient> = {}): GithubContentClient {
  return {
    getIndexJson: async () => ({
      sha: "index-sha",
      raw: JSON.stringify({
        format_version: 1,
        tickets: [{ id: "01KHVX923A", title: "T", state: "ready", priority: "p1" }],
      }),
    }),
    ...overrides,
  };
}

function createSecurityRecorder(): { monitor: GithubWebhookSecurityMonitor; events: GithubWebhookSecurityEvent[] } {
  const events: GithubWebhookSecurityEvent[] = [];
  return {
    events,
    monitor: {
      record(event) {
        events.push(event);
      },
    },
  };
}

test("extractShortIds finds display IDs and branch IDs", () => {
  const ids = extractShortIds("Fix TK-01khvx92 in branch feat/tk-01khvx92 and TK-01KHVX93");
  assert.deepEqual(ids.sort(), ["01KHVX92", "01KHVX93"]);
});

test("mapChecksState maps GitHub status/conclusion consistently", () => {
  assert.equal(mapChecksState(null, null), "unknown");
  assert.equal(mapChecksState("queued", null), "running");
  assert.equal(mapChecksState("completed", "success"), "pass");
  assert.equal(mapChecksState("completed", "failure"), "fail");
  assert.equal(mapChecksState("completed", "cancelled"), "fail");
  assert.equal(mapChecksState("completed", "timed_out"), "fail");
  assert.equal(mapChecksState("completed", "action_required"), "fail");
  assert.equal(mapChecksState("completed", "neutral"), "unknown");
});

test("processWebhook fails when secret is missing", async () => {
  const service = createGithubWebhookService({
    secret: undefined,
    store: createStoreMock(),
    github: createGithubMock(),
  });

  const result = await service.processWebhook({
    rawBodyBytes: Buffer.from("{}"),
    signature: "sha256=abc",
    event: "push",
    deliveryId: "d1",
  });

  assert.equal(result.status, 500);
  assert.equal(result.body.error, "webhook_secret_not_configured");
});

test("processWebhook returns deduped when delivery is already seen", async () => {
  const service = createGithubWebhookService({
    secret: SECRET,
    store: createStoreMock({ recordDeliveryIfNew: async () => false }),
    github: createGithubMock(),
  });

  const body = JSON.stringify({});
  const result = await service.processWebhook({
    rawBodyBytes: Buffer.from(body),
    signature: signBody(body, SECRET),
    event: "push",
    deliveryId: "delivery-id",
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.deduped, true);
  assert.equal(result.body.dedupeReason, "delivery_id");
});

test("processWebhook returns deduped when idempotency key is already seen", async () => {
  const idempotencyKeys = new Set<string>();
  const service = createGithubWebhookService({
    secret: SECRET,
    store: createStoreMock({
      recordIdempotencyKeyIfNew: async (idempotencyKey) => {
        if (idempotencyKeys.has(idempotencyKey)) return false;
        idempotencyKeys.add(idempotencyKey);
        return true;
      },
    }),
    github: createGithubMock(),
  });

  const body = JSON.stringify({
    ref: "refs/heads/main",
    after: "head123",
    repository: { full_name: "acme/repo", default_branch: "main" },
  });
  const signature = signBody(body, SECRET);

  const first = await service.processWebhook({
    rawBodyBytes: Buffer.from(body),
    signature,
    event: "push",
    deliveryId: "d-idem-1",
  });

  const second = await service.processWebhook({
    rawBodyBytes: Buffer.from(body),
    signature,
    event: "push",
    deliveryId: "d-idem-2",
  });

  assert.equal(first.status, 200);
  assert.equal(first.body.ok, true);
  assert.equal(second.status, 200);
  assert.equal(second.body.deduped, true);
  assert.equal(second.body.dedupeReason, "idempotency_key");
});

test("processWebhook rejects invalid signature", async () => {
  const security = createSecurityRecorder();
  const service = createGithubWebhookService({
    secret: SECRET,
    store: createStoreMock(),
    github: createGithubMock(),
    security: security.monitor,
  });

  const result = await service.processWebhook({
    rawBodyBytes: Buffer.from("{}"),
    signature: "sha256=invalid",
    event: "push",
    deliveryId: "d1",
  });

  assert.equal(result.status, 401);
  assert.equal(result.body.error, "invalid_signature");
  assert.deepEqual(
    security.events.map((event) => event.type),
    ["signature_malformed"],
  );
});

test("processWebhook records invalid signature hash mismatch", async () => {
  const security = createSecurityRecorder();
  const body = JSON.stringify({});
  const validButWrong = signBody(body, `${SECRET}-wrong`);

  const service = createGithubWebhookService({
    secret: SECRET,
    store: createStoreMock(),
    github: createGithubMock(),
    security: security.monitor,
  });

  const result = await service.processWebhook({
    rawBodyBytes: Buffer.from(body),
    signature: validButWrong,
    event: "push",
    deliveryId: "d1-mismatch",
  });

  assert.equal(result.status, 401);
  assert.equal(result.body.error, "invalid_signature");
  assert.deepEqual(
    security.events.map((event) => event.type),
    ["signature_invalid"],
  );
});

test("processWebhook records replay attempts for delivery-id and idempotency dedupe", async () => {
  const idempotencyKeys = new Set<string>();
  const security = createSecurityRecorder();
  const service = createGithubWebhookService({
    secret: SECRET,
    store: createStoreMock({
      recordDeliveryIfNew: async (deliveryId) => deliveryId !== "duplicate-delivery",
      recordIdempotencyKeyIfNew: async (idempotencyKey) => {
        if (idempotencyKeys.has(idempotencyKey)) return false;
        idempotencyKeys.add(idempotencyKey);
        return true;
      },
    }),
    github: createGithubMock(),
    security: security.monitor,
  });

  const body = JSON.stringify({
    ref: "refs/heads/main",
    after: "head123",
    repository: { full_name: "acme/repo", default_branch: "main" },
  });
  const signature = signBody(body, SECRET);

  const replayDeliveryResult = await service.processWebhook({
    rawBodyBytes: Buffer.from(body),
    signature,
    event: "push",
    deliveryId: "duplicate-delivery",
  });

  const firstPass = await service.processWebhook({
    rawBodyBytes: Buffer.from(body),
    signature,
    event: "push",
    deliveryId: "unique-delivery-1",
  });

  const replayIdempotencyResult = await service.processWebhook({
    rawBodyBytes: Buffer.from(body),
    signature,
    event: "push",
    deliveryId: "unique-delivery-2",
  });

  assert.equal(replayDeliveryResult.status, 200);
  assert.equal(replayDeliveryResult.body.dedupeReason, "delivery_id");
  assert.equal(firstPass.status, 200);
  assert.equal(replayIdempotencyResult.status, 200);
  assert.equal(replayIdempotencyResult.body.dedupeReason, "idempotency_key");
  assert.equal(security.events.some((event) => event.type === "replay_delivery"), true);
  assert.equal(security.events.some((event) => event.type === "replay_idempotency"), true);
});

test("processWebhook records missing delivery id while still processing", async () => {
  const security = createSecurityRecorder();
  const service = createGithubWebhookService({
    secret: SECRET,
    store: createStoreMock(),
    github: createGithubMock(),
    security: security.monitor,
  });

  const body = JSON.stringify({
    ref: "refs/heads/main",
    after: "head123",
    repository: { full_name: "acme/repo", default_branch: "main" },
  });

  const result = await service.processWebhook({
    rawBodyBytes: Buffer.from(body),
    signature: signBody(body, SECRET),
    event: "push",
    deliveryId: null,
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(security.events.some((event) => event.type === "signature_verified"), true);
  assert.equal(security.events.some((event) => event.type === "delivery_id_missing"), true);
});

test("processWebhook records invalid JSON payload security event", async () => {
  const security = createSecurityRecorder();
  const rawBody = "{";

  const service = createGithubWebhookService({
    secret: SECRET,
    store: createStoreMock(),
    github: createGithubMock(),
    security: security.monitor,
  });

  const result = await service.processWebhook({
    rawBodyBytes: Buffer.from(rawBody),
    signature: signBody(rawBody, SECRET),
    event: "push",
    deliveryId: "invalid-json",
  });

  assert.equal(result.status, 400);
  assert.equal(result.body.error, "invalid_payload");
  assert.equal(security.events.some((event) => event.type === "payload_invalid_json"), true);
});

test("push event syncs index and updates repo metadata", async () => {
  const calls = {
    upsertSnapshot: 0,
    upsertBlob: 0,
    upsertTicket: 0,
    deleteNotIn: 0,
    updateRepoAfterPush: 0,
  };

  const service = createGithubWebhookService({
    secret: SECRET,
    store: createStoreMock({
      upsertTicketIndexSnapshot: async () => {
        calls.upsertSnapshot += 1;
      },
      upsertBlob: async () => {
        calls.upsertBlob += 1;
      },
      upsertTicketFromIndexEntry: async () => {
        calls.upsertTicket += 1;
      },
      deleteTicketsNotIn: async () => {
        calls.deleteNotIn += 1;
      },
      updateRepoAfterPush: async () => {
        calls.updateRepoAfterPush += 1;
      },
    }),
    github: createGithubMock(),
  });

  const body = JSON.stringify({
    ref: "refs/heads/main",
    after: "head123",
    repository: { full_name: "acme/repo", default_branch: "main" },
  });

  const result = await service.processWebhook({
    rawBodyBytes: Buffer.from(body),
    signature: signBody(body, SECRET),
    event: "push",
    deliveryId: "d2",
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(calls.upsertSnapshot, 1);
  assert.equal(calls.upsertBlob, 1);
  assert.equal(calls.upsertTicket, 1);
  assert.equal(calls.deleteNotIn, 1);
  assert.equal(calls.updateRepoAfterPush, 1);
});

test("push event rejects invalid index format and does not persist snapshot", async () => {
  let upsertSnapshot = 0;
  let markedError = 0;

  const service = createGithubWebhookService({
    secret: SECRET,
    store: createStoreMock({
      upsertTicketIndexSnapshot: async () => {
        upsertSnapshot += 1;
      },
      setRepoSyncError: async () => {
        markedError += 1;
      },
    }),
    github: createGithubMock({
      getIndexJson: async () => ({
        sha: "index-sha",
        raw: JSON.stringify({ format_version: 99, tickets: [] }),
      }),
    }),
  });

  const body = JSON.stringify({
    ref: "refs/heads/main",
    after: "head123",
    repository: { full_name: "acme/repo", default_branch: "main" },
  });

  await assert.rejects(
    service.processWebhook({
      rawBodyBytes: Buffer.from(body),
      signature: signBody(body, SECRET),
      event: "push",
      deliveryId: "d3-invalid-index",
    }),
    /index\.json format invalid/
  );

  assert.equal(upsertSnapshot, 0);
  assert.equal(markedError, 1);
});

test("push event ignores non-default branch", async () => {
  let githubCalled = false;

  const service = createGithubWebhookService({
    secret: SECRET,
    store: createStoreMock(),
    github: createGithubMock({
      getIndexJson: async () => {
        githubCalled = true;
        return { sha: "x", raw: "{}" };
      },
    }),
  });

  const body = JSON.stringify({
    ref: "refs/heads/feature",
    after: "head123",
    repository: { full_name: "acme/repo", default_branch: "main" },
  });

  const result = await service.processWebhook({
    rawBodyBytes: Buffer.from(body),
    signature: signBody(body, SECRET),
    event: "push",
    deliveryId: "d3",
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.message, "Ignored non-default-branch push");
  assert.equal(githubCalled, false);
});

test("push event skips when repo sync lock is already held", async () => {
  let githubCalled = false;

  const service = createGithubWebhookService({
    secret: SECRET,
    store: createStoreMock({
      tryAcquireRepoSyncLock: async () => false,
    }),
    github: createGithubMock({
      getIndexJson: async () => {
        githubCalled = true;
        return { sha: "x", raw: "{}" };
      },
    }),
  });

  const body = JSON.stringify({
    ref: "refs/heads/main",
    after: "head123",
    repository: { full_name: "acme/repo", default_branch: "main" },
  });

  const result = await service.processWebhook({
    rawBodyBytes: Buffer.from(body),
    signature: signBody(body, SECRET),
    event: "push",
    deliveryId: "d3b",
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.message, "Repo sync already in progress");
  assert.equal(githubCalled, false);
});

test("push event releases lock and records sync error when processing fails", async () => {
  let released = 0;
  let markedError = 0;

  const service = createGithubWebhookService({
    secret: SECRET,
    store: createStoreMock({
      releaseRepoSyncLock: async () => {
        released += 1;
      },
      setRepoSyncError: async () => {
        markedError += 1;
      },
    }),
    github: createGithubMock({
      getIndexJson: async () => {
        throw new Error("boom");
      },
    }),
  });

  const body = JSON.stringify({
    ref: "refs/heads/main",
    after: "head123",
    repository: { full_name: "acme/repo", default_branch: "main" },
  });

  await assert.rejects(
    service.processWebhook({
      rawBodyBytes: Buffer.from(body),
      signature: signBody(body, SECRET),
      event: "push",
      deliveryId: "d3c",
    }),
    /boom/
  );

  assert.equal(markedError, 1);
  assert.equal(released, 1);
});

test("pull_request event replaces mappings and upserts matched ticket links", async () => {
  let replaced = 0;
  const upserted: string[] = [];

  const service = createGithubWebhookService({
    secret: SECRET,
    store: createStoreMock({
      findTicketsByShortIds: async () => [{ id: "01KHVX92AAAA" }, { id: "01KHVX93BBBB" }],
      replaceTicketPrMappings: async () => {
        replaced += 1;
      },
      upsertTicketPr: async (input) => {
        upserted.push(input.ticketId);
      },
    }),
    github: createGithubMock(),
  });

  const body = JSON.stringify({
    action: "opened",
    pull_request: {
      number: 12,
      html_url: "https://github.com/acme/repo/pull/12",
      title: "Ship TK-01KHVX92 and TK-01KHVX93",
      body: null,
      state: "open",
      merged: false,
      mergeable_state: "clean",
      head: { ref: "feat/tk-01khvx92", sha: "abc" },
    },
    repository: { full_name: "acme/repo" },
  });

  const result = await service.processWebhook({
    rawBodyBytes: Buffer.from(body),
    signature: signBody(body, SECRET),
    event: "pull_request",
    deliveryId: "d4",
  });

  assert.equal(result.status, 200);
  assert.equal(replaced, 1);
  assert.deepEqual(upserted.sort(), ["01KHVX92AAAA", "01KHVX93BBBB"]);
});

test("pull_request event ignores unsupported actions", async () => {
  let replaced = 0;
  let lookedUp = 0;
  let upserted = 0;

  const service = createGithubWebhookService({
    secret: SECRET,
    store: createStoreMock({
      replaceTicketPrMappings: async () => {
        replaced += 1;
      },
      findTicketsByShortIds: async () => {
        lookedUp += 1;
        return [{ id: "01KHVX92AAAA" }];
      },
      upsertTicketPr: async () => {
        upserted += 1;
      },
    }),
    github: createGithubMock(),
  });

  const body = JSON.stringify({
    action: "labeled",
    pull_request: {
      number: 12,
      html_url: "https://github.com/acme/repo/pull/12",
      title: "Ship TK-01KHVX92",
      body: null,
      state: "open",
      merged: false,
      mergeable_state: "clean",
      head: { ref: "feat/tk-01khvx92", sha: "abc" },
    },
    repository: { full_name: "acme/repo" },
  });

  const result = await service.processWebhook({
    rawBodyBytes: Buffer.from(body),
    signature: signBody(body, SECRET),
    event: "pull_request",
    deliveryId: "d4b",
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.message, "Ignored pull_request action labeled");
  assert.equal(replaced, 0);
  assert.equal(lookedUp, 0);
  assert.equal(upserted, 0);
});

test("pull_request event clears mappings when no ticket IDs are linked", async () => {
  let replaced = 0;
  let lookedUp = 0;
  let upserted = 0;

  const service = createGithubWebhookService({
    secret: SECRET,
    store: createStoreMock({
      replaceTicketPrMappings: async () => {
        replaced += 1;
      },
      findTicketsByShortIds: async () => {
        lookedUp += 1;
        return [];
      },
      upsertTicketPr: async () => {
        upserted += 1;
      },
    }),
    github: createGithubMock(),
  });

  const body = JSON.stringify({
    action: "closed",
    pull_request: {
      number: 42,
      html_url: "https://github.com/acme/repo/pull/42",
      title: "Maintenance PR with no ticket refs",
      body: "No ticket",
      state: "closed",
      merged: true,
      mergeable_state: "clean",
      head: { ref: "chore/deps", sha: "def" },
    },
    repository: { full_name: "acme/repo" },
  });

  const result = await service.processWebhook({
    rawBodyBytes: Buffer.from(body),
    signature: signBody(body, SECRET),
    event: "pull_request",
    deliveryId: "d4c",
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.message, "PR cached with no ticket links");
  assert.equal(replaced, 1);
  assert.equal(lookedUp, 0);
  assert.equal(upserted, 0);
});

test("pull_request event no-ops when repo is not connected", async () => {
  let replaced = 0;
  let upserted = 0;

  const service = createGithubWebhookService({
    secret: SECRET,
    store: createStoreMock({
      findRepo: async () => null,
      replaceTicketPrMappings: async () => {
        replaced += 1;
      },
      upsertTicketPr: async () => {
        upserted += 1;
      },
    }),
    github: createGithubMock(),
  });

  const body = JSON.stringify({
    action: "opened",
    pull_request: {
      number: 12,
      html_url: "https://github.com/acme/repo/pull/12",
      title: "Ship TK-01KHVX92",
      body: null,
      state: "open",
      merged: false,
      mergeable_state: "clean",
      head: { ref: "feat/tk-01khvx92", sha: "abc" },
    },
    repository: { full_name: "acme/repo" },
  });

  const result = await service.processWebhook({
    rawBodyBytes: Buffer.from(body),
    signature: signBody(body, SECRET),
    event: "pull_request",
    deliveryId: "d4d",
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.message, "Repo not connected");
  assert.equal(replaced, 0);
  assert.equal(upserted, 0);
});

test("check_run event updates check state for linked PRs", async () => {
  const updated: number[] = [];

  const service = createGithubWebhookService({
    secret: SECRET,
    store: createStoreMock({
      updateTicketPrChecks: async (_repo, prNumber, checksState) => {
        assert.equal(checksState, "fail");
        updated.push(prNumber);
      },
    }),
    github: createGithubMock(),
  });

  const body = JSON.stringify({
    action: "completed",
    check_run: {
      status: "completed",
      conclusion: "failure",
      pull_requests: [{ number: 4 }, { number: 7 }],
    },
    repository: { full_name: "acme/repo" },
  });

  const result = await service.processWebhook({
    rawBodyBytes: Buffer.from(body),
    signature: signBody(body, SECRET),
    event: "check_run",
    deliveryId: "d5",
  });

  assert.equal(result.status, 200);
  assert.deepEqual(updated, [4, 7]);
});

test("check_run event deduplicates repeated PR links", async () => {
  const updated: number[] = [];

  const service = createGithubWebhookService({
    secret: SECRET,
    store: createStoreMock({
      updateTicketPrChecks: async (_repo, prNumber) => {
        updated.push(prNumber);
      },
    }),
    github: createGithubMock(),
  });

  const body = JSON.stringify({
    action: "completed",
    check_run: {
      status: "completed",
      conclusion: "success",
      pull_requests: [{ number: 4 }, { number: 4 }, { number: 7 }],
    },
    repository: { full_name: "acme/repo" },
  });

  const result = await service.processWebhook({
    rawBodyBytes: Buffer.from(body),
    signature: signBody(body, SECRET),
    event: "check_run",
    deliveryId: "d5b",
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.message, "Updated checks for 2 PR(s)");
  assert.deepEqual(updated, [4, 7]);
});

test("check_suite completed event updates checks state", async () => {
  const updated: Array<{ pr: number; state: string }> = [];

  const service = createGithubWebhookService({
    secret: SECRET,
    store: createStoreMock({
      updateTicketPrChecks: async (_repo, prNumber, checksState) => {
        updated.push({ pr: prNumber, state: checksState });
      },
    }),
    github: createGithubMock(),
  });

  const body = JSON.stringify({
    action: "completed",
    check_suite: {
      status: "completed",
      conclusion: "success",
      pull_requests: [{ number: 9 }],
    },
    repository: { full_name: "acme/repo" },
  });

  const result = await service.processWebhook({
    rawBodyBytes: Buffer.from(body),
    signature: signBody(body, SECRET),
    event: "check_suite",
    deliveryId: "d5c",
  });

  assert.equal(result.status, 200);
  assert.deepEqual(updated, [{ pr: 9, state: "pass" }]);
});

test("check_run event ignores unsupported check action", async () => {
  let updated = 0;

  const service = createGithubWebhookService({
    secret: SECRET,
    store: createStoreMock({
      updateTicketPrChecks: async () => {
        updated += 1;
      },
    }),
    github: createGithubMock(),
  });

  const body = JSON.stringify({
    action: "requested_action",
    check_run: {
      status: "completed",
      conclusion: "failure",
      pull_requests: [{ number: 4 }],
    },
    repository: { full_name: "acme/repo" },
  });

  const result = await service.processWebhook({
    rawBodyBytes: Buffer.from(body),
    signature: signBody(body, SECRET),
    event: "check_run",
    deliveryId: "d5d",
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.message, "Ignored check_run action requested_action");
  assert.equal(updated, 0);
});

test("check_run event ignores non-completed status when action is absent", async () => {
  let updated = 0;

  const service = createGithubWebhookService({
    secret: SECRET,
    store: createStoreMock({
      updateTicketPrChecks: async () => {
        updated += 1;
      },
    }),
    github: createGithubMock(),
  });

  const body = JSON.stringify({
    check_run: {
      status: "in_progress",
      conclusion: null,
      pull_requests: [{ number: 4 }],
    },
    repository: { full_name: "acme/repo" },
  });

  const result = await service.processWebhook({
    rawBodyBytes: Buffer.from(body),
    signature: signBody(body, SECRET),
    event: "check_run",
    deliveryId: "d5e",
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.message, "Ignored check_run status in_progress");
  assert.equal(updated, 0);
});

test("check_run event no-ops when repo is not connected", async () => {
  let updated = 0;

  const service = createGithubWebhookService({
    secret: SECRET,
    store: createStoreMock({
      findRepo: async () => null,
      updateTicketPrChecks: async () => {
        updated += 1;
      },
    }),
    github: createGithubMock(),
  });

  const body = JSON.stringify({
    action: "completed",
    check_run: {
      status: "completed",
      conclusion: "failure",
      pull_requests: [{ number: 4 }],
    },
    repository: { full_name: "acme/repo" },
  });

  const result = await service.processWebhook({
    rawBodyBytes: Buffer.from(body),
    signature: signBody(body, SECRET),
    event: "check_run",
    deliveryId: "d5f",
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.message, "Repo not connected");
  assert.equal(updated, 0);
});

test("check_run event acknowledges payload with no linked PRs", async () => {
  let updated = 0;

  const service = createGithubWebhookService({
    secret: SECRET,
    store: createStoreMock({
      updateTicketPrChecks: async () => {
        updated += 1;
      },
    }),
    github: createGithubMock(),
  });

  const body = JSON.stringify({
    action: "completed",
    check_run: {
      status: "completed",
      conclusion: "failure",
      pull_requests: [],
    },
    repository: { full_name: "acme/repo" },
  });

  const result = await service.processWebhook({
    rawBodyBytes: Buffer.from(body),
    signature: signBody(body, SECRET),
    event: "check_run",
    deliveryId: "d5g",
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.message, "No PR links on check payload");
  assert.equal(updated, 0);
});

test("unknown events are acknowledged and ignored", async () => {
  const service = createGithubWebhookService({
    secret: SECRET,
    store: createStoreMock(),
    github: createGithubMock(),
  });

  const body = JSON.stringify({ repository: { full_name: "acme/repo" } });
  const result = await service.processWebhook({
    rawBodyBytes: Buffer.from(body),
    signature: signBody(body, SECRET),
    event: "issues",
    deliveryId: "d6",
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.message, "Ignored issues");
});
