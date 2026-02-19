import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { getInstallationOctokit } from "@/lib/github-app";
import {
  upsertBlob,
  upsertTicketFromIndexEntry,
  deleteTicketsNotInIndex,
  getRepo,
} from "@/db/sync";

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

// ============================================================================
// Signature Verification
// ============================================================================

function verifySignature(payload: string, signature: string | null): boolean {
  if (!WEBHOOK_SECRET || !signature) return false;
  
  const expected = `sha256=${crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(payload)
    .digest("hex")}`;
  
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ============================================================================
// Delivery Deduplication
// ============================================================================

async function recordDeliveryIfNew(deliveryId: string, event: string): Promise<boolean> {
  try {
    const result = await db
      .insert(schema.webhookDeliveries)
      .values({ deliveryId, event })
      .onConflictDoNothing()
      .returning({ deliveryId: schema.webhookDeliveries.deliveryId });
    
    return result.length > 0; // true if inserted (new), false if duplicate
  } catch (error) {
    console.error("[webhook] Delivery dedupe error:", error);
    return true; // allow processing on error
  }
}

// ============================================================================
// Webhook Handler
// ============================================================================

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-hub-signature-256");
    const event = req.headers.get("x-github-event") ?? "";
    const deliveryId = req.headers.get("x-github-delivery") ?? "";

    // 1. Verify signature
    if (WEBHOOK_SECRET && !verifySignature(rawBody, signature)) {
      console.error("[webhook] Invalid signature");
      return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
    }

    // 2. Dedupe by delivery ID
    const isNew = await recordDeliveryIfNew(deliveryId, event);
    if (!isNew) {
      console.log(`[webhook] Duplicate delivery ${deliveryId}, ignoring`);
      return NextResponse.json({ ok: true, deduped: true });
    }

    // 3. Parse payload
    const payload = JSON.parse(rawBody);

    // 4. Route to handler based on event type
    // For now, we process synchronously. When we add Redis queue, this becomes enqueue.
    let result: { ok: boolean; message?: string; error?: string };

    switch (event) {
      case "push":
        result = await handlePushEvent(payload, deliveryId);
        break;
      case "pull_request":
        result = await handlePullRequestEvent(payload);
        break;
      case "check_run":
      case "check_suite":
        result = await handleCheckEvent(event, payload);
        break;
      case "installation":
        result = await handleInstallationEvent(payload);
        break;
      default:
        result = { ok: true, message: `Ignored event: ${event}` };
    }

    const elapsed = Date.now() - startTime;
    console.log(`[webhook] ${event} ${deliveryId} processed in ${elapsed}ms:`, result);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[webhook] Error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// GitHub sends a GET to verify the webhook URL
export async function GET() {
  return NextResponse.json({ status: "ok", service: "ticket.app webhook" });
}

// ============================================================================
// Event Handlers
// ============================================================================

interface PushPayload {
  ref: string;
  after: string;
  repository: {
    full_name: string;
    default_branch: string;
    owner: { login: string };
    name: string;
  };
  installation?: { id: number };
  commits?: Array<{
    added: string[];
    modified: string[];
    removed: string[];
  }>;
}

async function handlePushEvent(payload: PushPayload, deliveryId: string): Promise<{ ok: boolean; message?: string; error?: string }> {
  const ref = payload.ref;
  const defaultBranch = payload.repository.default_branch;
  const pushedBranch = ref.replace("refs/heads/", "");
  
  // Only handle pushes to default branch
  if (pushedBranch !== defaultBranch) {
    return { ok: true, message: "Ignored non-default branch push" };
  }

  const fullName = payload.repository.full_name;
  const headSha = payload.after;
  const installationId = payload.installation?.id;

  // Check if this affects .tickets/
  const affectsTickets = payload.commits?.some((commit) => {
    const allPaths = [...commit.added, ...commit.modified, ...commit.removed];
    return allPaths.some((path) => path.startsWith(".tickets/"));
  }) ?? false;

  if (!affectsTickets) {
    return { ok: true, message: "No ticket changes" };
  }

  // Find the repo in our DB
  const repo = await db.query.repos.findFirst({
    where: eq(schema.repos.fullName, fullName),
  });

  if (!repo) {
    return { ok: true, message: "Repo not connected" };
  }

  // Update sync state
  await db
    .insert(schema.repoSyncState)
    .values({
      repoId: repo.id,
      headSha,
      lastWebhookDeliveryId: deliveryId,
      lastSyncedAt: new Date(),
      status: "syncing",
    })
    .onConflictDoUpdate({
      target: schema.repoSyncState.repoId,
      set: {
        headSha,
        lastWebhookDeliveryId: deliveryId,
        lastSyncedAt: new Date(),
        status: "syncing",
      },
    });

  // If no installation ID, we can't fetch - just record sync needed
  if (!installationId) {
    console.log(`[webhook] Push to ${fullName} recorded (no installation), head_sha=${headSha}`);
    return { ok: true, message: `Push recorded for ${fullName} (no installation token)` };
  }

  // Sync tickets using installation token
  try {
    const syncResult = await syncTicketsFromWebhook({
      fullName,
      defaultBranch,
      headSha,
      installationId,
      repoId: repo.id,
    });

    // Update sync state to ok
    await db
      .update(schema.repoSyncState)
      .set({ status: "ok", lastSyncedAt: new Date() })
      .where(eq(schema.repoSyncState.repoId, repo.id));

    console.log(`[webhook] Push to ${fullName} synced, ${syncResult.ticketCount} tickets, sha=${syncResult.indexSha}`);

    return {
      ok: true,
      message: `Synced ${syncResult.ticketCount} tickets for ${fullName}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    console.error(`[webhook] Push sync failed for ${fullName}:`, message);

    // Update sync state to error
    await db
      .update(schema.repoSyncState)
      .set({ status: "error", lastSyncedAt: new Date() })
      .where(eq(schema.repoSyncState.repoId, repo.id));

    // Don't fail the webhook - GitHub will retry
    return { ok: true, message: `Push recorded, sync failed: ${message}` };
  }
}

// ============================================================================
// Webhook Sync Helper
// ============================================================================

interface SyncFromWebhookArgs {
  fullName: string;
  defaultBranch: string;
  headSha: string;
  installationId: number;
  repoId: string;
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

async function syncTicketsFromWebhook(args: SyncFromWebhookArgs): Promise<{ ticketCount: number; indexSha: string }> {
  const { fullName, defaultBranch, headSha, installationId, repoId } = args;
  const [owner, repoName] = fullName.split("/");

  // Get installation Octokit
  const octokit = getInstallationOctokit(installationId);

  // Fetch index.json
  const indexRes = await octokit.rest.repos.getContent({
    owner,
    repo: repoName,
    path: ".tickets/index.json",
    ref: defaultBranch,
  });

  if (Array.isArray(indexRes.data) || indexRes.data.type !== "file") {
    throw new Error("index.json is not a file");
  }

  const indexSha = indexRes.data.sha;
  const rawIndex = Buffer.from(indexRes.data.content, "base64").toString("utf-8");

  // Parse index.json
  const idx: IndexJson = JSON.parse(rawIndex);

  if (idx.format_version !== 1 || !Array.isArray(idx.tickets)) {
    throw new Error("index.json format invalid");
  }

  // Upsert blob cache
  await upsertBlob(fullName, ".tickets/index.json", indexSha, rawIndex);

  // Upsert tickets
  const entries = idx.tickets;
  const idsInIndex = entries.map((e) => String(e.id).toUpperCase());

  for (const e of entries) {
    await upsertTicketFromIndexEntry(fullName, indexSha, e);
  }

  // Delete tickets no longer in index
  await deleteTicketsNotInIndex(fullName, idsInIndex);

  // Update repo metadata
  await db
    .update(schema.repos)
    .set({
      lastSeenHeadSha: headSha,
      lastIndexSha: indexSha,
      lastSyncedAt: new Date(),
      syncStatus: "idle",
      syncError: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.repos.fullName, fullName));

  return { ticketCount: entries.length, indexSha };
}

interface PullRequestPayload {
  action: string;
  number: number;
  pull_request: {
    number: number;
    html_url: string;
    title: string;
    state: string;
    merged: boolean;
    mergeable_state?: string;
    head: { ref: string };
  };
  repository: {
    full_name: string;
    owner: { login: string };
    name: string;
  };
}

async function handlePullRequestEvent(payload: PullRequestPayload): Promise<{ ok: boolean; message?: string }> {
  const fullName = payload.repository.full_name;
  const pr = payload.pull_request;

  // Find repo
  const repo = await db.query.repos.findFirst({
    where: eq(schema.repos.fullName, fullName),
  });

  if (!repo) {
    return { ok: true, message: "Repo not connected" };
  }

  // Derive linked ticket IDs from title and branch
  const linkedIds = deriveLinkedTicketIds(pr.title, pr.head.ref);

  // Upsert PR cache
  await db
    .insert(schema.prCache)
    .values({
      repoId: repo.id,
      prNumber: pr.number,
      prUrl: pr.html_url,
      headRef: pr.head.ref,
      title: pr.title,
      state: pr.state,
      merged: pr.merged,
      mergeableState: pr.mergeable_state ?? null,
      linkedTicketShortIds: linkedIds,
    })
    .onConflictDoUpdate({
      target: [schema.prCache.repoId, schema.prCache.prNumber],
      set: {
        prUrl: pr.html_url,
        headRef: pr.head.ref,
        title: pr.title,
        state: pr.state,
        merged: pr.merged,
        mergeableState: pr.mergeable_state ?? null,
        linkedTicketShortIds: linkedIds,
        updatedAt: new Date(),
      },
    });

  return { ok: true, message: `PR #${pr.number} cached` };
}

interface CheckPayload {
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

async function handleCheckEvent(event: string, payload: CheckPayload): Promise<{ ok: boolean; message?: string }> {
  const fullName = payload.repository.full_name;
  const check = event === "check_run" ? payload.check_run : payload.check_suite;
  
  if (!check) {
    return { ok: true, message: "No check data" };
  }

  const prs = check.pull_requests ?? [];
  if (prs.length === 0) {
    return { ok: true, message: "No PRs affected" };
  }

  // Find repo
  const repo = await db.query.repos.findFirst({
    where: eq(schema.repos.fullName, fullName),
  });

  if (!repo) {
    return { ok: true, message: "Repo not connected" };
  }

  const status = mapCheckStatus(check.status, check.conclusion);

  // Update checks cache for each PR
  for (const pr of prs) {
    await db
      .insert(schema.prChecksCache)
      .values({
        repoId: repo.id,
        prNumber: pr.number,
        status,
      })
      .onConflictDoUpdate({
        target: [schema.prChecksCache.repoId, schema.prChecksCache.prNumber],
        set: {
          status,
          updatedAt: new Date(),
        },
      });
  }

  return { ok: true, message: `Checks updated for ${prs.length} PRs` };
}

interface InstallationPayload {
  action: string;
  installation: {
    id: number;
    account: { login: string };
  };
}

async function handleInstallationEvent(payload: InstallationPayload): Promise<{ ok: boolean; message?: string }> {
  const { action, installation } = payload;

  if (action === "created" || action === "added") {
    await db
      .insert(schema.installations)
      .values({
        githubInstallationId: installation.id,
        githubAccountLogin: installation.account.login,
      })
      .onConflictDoUpdate({
        target: schema.installations.githubInstallationId,
        set: {
          githubAccountLogin: installation.account.login,
          updatedAt: new Date(),
        },
      });
    
    return { ok: true, message: `Installation ${installation.id} recorded` };
  }

  if (action === "deleted") {
    await db
      .delete(schema.installations)
      .where(eq(schema.installations.githubInstallationId, installation.id));
    
    return { ok: true, message: `Installation ${installation.id} removed` };
  }

  return { ok: true, message: `Installation action ${action} ignored` };
}

// ============================================================================
// Helpers
// ============================================================================

function deriveLinkedTicketIds(title: string, headRef: string): string[] {
  const out = new Set<string>();
  
  // Match [TK-XXXXXXXX] in title
  const titleRe = /\[TK-([A-Z0-9]{8})\]/gi;
  let m: RegExpExecArray | null;
  while ((m = titleRe.exec(title))) {
    out.add(m[1].toUpperCase());
  }
  
  // Match tk-xxxxxxxx- in branch name
  const branchRe = /tk-([a-z0-9]{8})-/gi;
  while ((m = branchRe.exec(headRef))) {
    out.add(m[1].toUpperCase());
  }
  
  return Array.from(out);
}

function mapCheckStatus(status: string | null, conclusion: string | null): "pass" | "fail" | "running" | "unknown" {
  if (!status) return "unknown";
  if (status !== "completed") return "running";
  if (!conclusion) return "unknown";
  if (conclusion === "success") return "pass";
  if (["failure", "cancelled", "timed_out", "action_required"].includes(conclusion)) return "fail";
  return "unknown";
}
