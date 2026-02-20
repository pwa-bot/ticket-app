import crypto from "node:crypto";

export interface IndexJson {
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

export interface PushPayload {
  ref: string;
  after: string;
  repository: {
    full_name: string;
    default_branch: string;
  };
  installation?: { id: number };
}

export interface PullRequestPayload {
  action: string;
  pull_request: {
    number: number;
    html_url: string;
    title: string;
    body: string | null;
    state: string;
    merged: boolean;
    mergeable_state?: string | null;
    head: { ref: string; sha: string };
  };
  repository: {
    full_name: string;
  };
}

export interface CheckPayload {
  check_run?: {
    status: string;
    conclusion: string | null;
    pull_requests: Array<{ number: number }>;
  };
  check_suite?: {
    status: string;
    conclusion: string | null;
    pull_requests: Array<{ number: number }>;
  };
  repository: {
    full_name: string;
  };
}

interface RepoRecord {
  fullName: string;
  installationId: number | null;
}

interface TicketRecord {
  id: string;
}

type ChecksState = "pass" | "fail" | "running" | "unknown";

interface UpsertTicketPrInput {
  repoFullName: string;
  ticketId: string;
  prNumber: number;
  prUrl: string;
  title: string;
  state: string;
  merged: boolean;
  mergeableState: string | null;
  headRef: string;
  headSha: string;
}

interface RepoPushUpdate {
  headSha: string;
  indexSha: string;
  now: Date;
}

export interface GithubWebhookStore {
  recordDeliveryIfNew(deliveryId: string | null, event: string): Promise<boolean>;
  findRepo(fullName: string): Promise<RepoRecord | null>;
  findGithubInstallationId(installationId: number): Promise<number | null>;
  upsertBlob(repoFullName: string, path: string, sha: string, contentText: string): Promise<void>;
  upsertTicketFromIndexEntry(
    repoFullName: string,
    indexSha: string,
    headSha: string,
    entry: IndexJson["tickets"][number],
  ): Promise<void>;
  deleteAllTickets(repoFullName: string): Promise<void>;
  deleteTicketsNotIn(repoFullName: string, ticketIds: string[]): Promise<void>;
  updateRepoAfterPush(repoFullName: string, update: RepoPushUpdate): Promise<void>;
  replaceTicketPrMappings(repoFullName: string, prNumber: number): Promise<void>;
  findTicketsByShortIds(repoFullName: string, shortIds: string[]): Promise<TicketRecord[]>;
  upsertTicketPr(input: UpsertTicketPrInput): Promise<void>;
  updateTicketPrChecks(repoFullName: string, prNumber: number, checksState: ChecksState): Promise<void>;
}

export interface GithubContentClient {
  getIndexJson(params: { fullName: string; defaultBranch: string; installationId: number }): Promise<{ sha: string; raw: string }>;
}

interface GithubWebhookServiceDeps {
  secret: string | undefined;
  store: GithubWebhookStore;
  github: GithubContentClient;
}

interface ProcessWebhookInput {
  rawBodyBytes: Buffer;
  signature: string | null;
  event: string;
  deliveryId: string | null;
}

interface ServiceResponse {
  status: number;
  body: Record<string, unknown>;
}

const SUPPORTED_PR_ACTIONS = new Set(["opened", "reopened", "synchronize", "closed"]);

export function extractShortIds(text: string): string[] {
  const out = new Set<string>();

  const displayRe = /\bTK-([A-Z0-9]{8})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = displayRe.exec(text))) out.add(m[1].toUpperCase());

  const branchRe = /\btk-([a-z0-9]{8})\b/gi;
  while ((m = branchRe.exec(text))) out.add(m[1].toUpperCase());

  return Array.from(out);
}

export function mapChecksState(status: string | null, conclusion: string | null): ChecksState {
  if (!status) return "unknown";
  if (status !== "completed") return "running";
  if (!conclusion) return "unknown";
  if (conclusion === "success") return "pass";
  if (["failure", "cancelled", "timed_out", "action_required"].includes(conclusion)) return "fail";
  return "unknown";
}

export function createGithubWebhookService(deps: GithubWebhookServiceDeps) {
  function verifySignature(payload: Buffer, signature: string): boolean {
    if (!deps.secret) return false;
    const expected = `sha256=${crypto.createHmac("sha256", deps.secret).update(payload).digest("hex")}`;

    try {
      return crypto.timingSafeEqual(Buffer.from(signature, "utf8"), Buffer.from(expected, "utf8"));
    } catch {
      return false;
    }
  }

  async function resolveGithubInstallationId(fullName: string, fromPayload?: number): Promise<number | null> {
    if (fromPayload) return fromPayload;

    const repo = await deps.store.findRepo(fullName);
    if (!repo?.installationId) return null;

    return deps.store.findGithubInstallationId(repo.installationId);
  }

  async function handlePushEvent(payload: PushPayload): Promise<Record<string, unknown>> {
    const branch = payload.ref.replace("refs/heads/", "");
    if (branch !== payload.repository.default_branch) {
      return { ok: true, message: "Ignored non-default-branch push" };
    }

    const fullName = payload.repository.full_name;
    const headSha = payload.after;

    const repo = await deps.store.findRepo(fullName);
    if (!repo) {
      return { ok: true, message: "Repo not connected" };
    }

    const githubInstallationId = await resolveGithubInstallationId(fullName, payload.installation?.id);
    if (!githubInstallationId) {
      return { ok: true, message: "No installation for repo" };
    }

    const content = await deps.github.getIndexJson({
      fullName,
      defaultBranch: payload.repository.default_branch,
      installationId: githubInstallationId,
    });

    const indexSha = content.sha;
    const rawIndex = content.raw;

    const parsed = JSON.parse(rawIndex) as IndexJson;
    if (parsed.format_version !== 1 || !Array.isArray(parsed.tickets)) {
      throw new Error("index.json format invalid");
    }

    await deps.store.upsertBlob(fullName, ".tickets/index.json", indexSha, rawIndex);

    const idsInIndex = parsed.tickets.map((ticket) => String(ticket.id).toUpperCase());
    for (const entry of parsed.tickets) {
      await deps.store.upsertTicketFromIndexEntry(fullName, indexSha, headSha, entry);
    }

    if (idsInIndex.length === 0) {
      await deps.store.deleteAllTickets(fullName);
    } else {
      await deps.store.deleteTicketsNotIn(fullName, idsInIndex);
    }

    await deps.store.updateRepoAfterPush(fullName, {
      headSha,
      indexSha,
      now: new Date(),
    });

    return { ok: true, message: `Synced ${parsed.tickets.length} tickets` };
  }

  async function handlePullRequestEvent(payload: PullRequestPayload): Promise<Record<string, unknown>> {
    if (!SUPPORTED_PR_ACTIONS.has(payload.action)) {
      return { ok: true, message: `Ignored pull_request action ${payload.action}` };
    }

    const fullName = payload.repository.full_name;
    const pr = payload.pull_request;

    const repo = await deps.store.findRepo(fullName);
    if (!repo) {
      return { ok: true, message: "Repo not connected" };
    }

    const haystack = `${pr.title}\n${pr.body ?? ""}\n${pr.head.ref}`;
    const shortIds = extractShortIds(haystack);
    const matchedTickets = shortIds.length === 0 ? [] : await deps.store.findTicketsByShortIds(fullName, shortIds);

    await deps.store.replaceTicketPrMappings(fullName, pr.number);

    if (matchedTickets.length === 0) {
      return { ok: true, message: "PR cached with no ticket links" };
    }

    for (const ticket of matchedTickets) {
      await deps.store.upsertTicketPr({
        repoFullName: fullName,
        ticketId: ticket.id,
        prNumber: pr.number,
        prUrl: pr.html_url,
        title: pr.title,
        state: pr.state,
        merged: pr.merged,
        mergeableState: pr.mergeable_state ?? null,
        headRef: pr.head.ref,
        headSha: pr.head.sha,
      });
    }

    return { ok: true, message: `Cached PR links for ${matchedTickets.length} ticket(s)` };
  }

  async function handleCheckEvent(event: "check_run" | "check_suite", payload: CheckPayload): Promise<Record<string, unknown>> {
    const fullName = payload.repository.full_name;
    const check = event === "check_run" ? payload.check_run : payload.check_suite;
    if (!check) return { ok: true, message: "No check payload" };

    const prs = check.pull_requests ?? [];
    if (prs.length === 0) return { ok: true, message: "No PR links on check payload" };

    const checksState = mapChecksState(check.status, check.conclusion);

    for (const pr of prs) {
      await deps.store.updateTicketPrChecks(fullName, pr.number, checksState);
    }

    return { ok: true, message: `Updated checks for ${prs.length} PR(s)` };
  }

  async function processWebhook(input: ProcessWebhookInput): Promise<ServiceResponse> {
    if (!deps.secret) {
      return { status: 500, body: { ok: false, error: "webhook_secret_not_configured" } };
    }

    if (!input.signature) {
      return { status: 401, body: { ok: false, error: "missing_signature" } };
    }

    if (!verifySignature(input.rawBodyBytes, input.signature)) {
      return { status: 401, body: { ok: false, error: "invalid_signature" } };
    }

    const isNew = await deps.store.recordDeliveryIfNew(input.deliveryId, input.event);
    if (!isNew) {
      return { status: 200, body: { ok: true, deduped: true } };
    }

    const payload = JSON.parse(input.rawBodyBytes.toString("utf8")) as unknown;

    if (input.event === "push") {
      return { status: 200, body: await handlePushEvent(payload as PushPayload) };
    }

    if (input.event === "pull_request") {
      return { status: 200, body: await handlePullRequestEvent(payload as PullRequestPayload) };
    }

    if (input.event === "check_run" || input.event === "check_suite") {
      return {
        status: 200,
        body: await handleCheckEvent(input.event, payload as CheckPayload),
      };
    }

    return { status: 200, body: { ok: true, message: `Ignored ${input.event}` } };
  }

  return {
    verifySignature,
    processWebhook,
    handlePushEvent,
    handlePullRequestEvent,
    handleCheckEvent,
  };
}
