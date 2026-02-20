import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  createGithubWebhookService,
  extractShortIds,
  mapChecksState,
  type GithubContentClient,
  type GithubWebhookStore,
} from "../github-webhook-service";

const SECRET = "test-secret";

function signBody(body: string, secret: string): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(Buffer.from(body)).digest("hex")}`;
}

function createStoreMock(overrides: Partial<GithubWebhookStore> = {}): GithubWebhookStore {
  return {
    recordDeliveryIfNew: async () => true,
    findRepo: async () => ({ fullName: "acme/repo", installationId: 11 }),
    findGithubInstallationId: async () => 123,
    upsertBlob: async () => undefined,
    upsertTicketFromIndexEntry: async () => undefined,
    deleteAllTickets: async () => undefined,
    deleteTicketsNotIn: async () => undefined,
    updateRepoAfterPush: async () => undefined,
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

test("extractShortIds finds display IDs and branch IDs", () => {
  const ids = extractShortIds("Fix TK-01khvx92 in branch feat/tk-01khvx92 and TK-01KHVX93");
  assert.deepEqual(ids.sort(), ["01KHVX92", "01KHVX93"]);
});

test("mapChecksState maps GitHub status/conclusion consistently", () => {
  assert.equal(mapChecksState("queued", null), "running");
  assert.equal(mapChecksState("completed", "success"), "pass");
  assert.equal(mapChecksState("completed", "failure"), "fail");
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
});

test("processWebhook rejects invalid signature", async () => {
  const service = createGithubWebhookService({
    secret: SECRET,
    store: createStoreMock(),
    github: createGithubMock(),
  });

  const result = await service.processWebhook({
    rawBodyBytes: Buffer.from("{}"),
    signature: "sha256=invalid",
    event: "push",
    deliveryId: "d1",
  });

  assert.equal(result.status, 401);
  assert.equal(result.body.error, "invalid_signature");
});

test("push event syncs index and updates repo metadata", async () => {
  const calls = {
    upsertBlob: 0,
    upsertTicket: 0,
    deleteNotIn: 0,
    updateRepoAfterPush: 0,
  };

  const service = createGithubWebhookService({
    secret: SECRET,
    store: createStoreMock({
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
  assert.equal(calls.upsertBlob, 1);
  assert.equal(calls.upsertTicket, 1);
  assert.equal(calls.deleteNotIn, 1);
  assert.equal(calls.updateRepoAfterPush, 1);
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
