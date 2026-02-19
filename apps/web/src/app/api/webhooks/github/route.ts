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

// ============================================================================
// Protocol Check (GitHub Check Run)
// ============================================================================

interface ProtocolCheckArgs {
  owner: string;
  repo: string;
  prNumber: number;
  headSha: string;
  installationId: number;
}

interface ValidationError {
  path: string;
  line?: number;
  message: string;
}

async function runProtocolCheck(args: ProtocolCheckArgs): Promise<void> {
  const { owner, repo, prNumber, headSha, installationId } = args;
  const octokit = getInstallationOctokit(installationId);

  // 1. Create check run in "in_progress" state
  const checkRun = await octokit.rest.checks.create({
    owner,
    repo,
    name: "Ticket Protocol",
    head_sha: headSha,
    status: "in_progress",
    started_at: new Date().toISOString(),
  });

  const checkRunId = checkRun.data.id;

  try {
    // 2. Get files changed in this PR
    const filesRes = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    });

    const ticketFiles = filesRes.data.filter(
      (f) => f.filename.startsWith(".tickets/tickets/") && f.filename.endsWith(".md") && f.status !== "removed"
    );

    const indexChanged = filesRes.data.some((f) => f.filename === ".tickets/index.json");

    // If no ticket files changed, pass immediately
    if (ticketFiles.length === 0 && !indexChanged) {
      await octokit.rest.checks.update({
        owner,
        repo,
        check_run_id: checkRunId,
        status: "completed",
        conclusion: "success",
        completed_at: new Date().toISOString(),
        output: {
          title: "No ticket files changed",
          summary: "This PR does not modify any ticket files.",
        },
      });
      return;
    }

    // 3. Validate each ticket file
    const errors: ValidationError[] = [];

    for (const file of ticketFiles) {
      const fileErrors = await validateTicketFile({
        octokit,
        owner,
        repo,
        ref: headSha,
        path: file.filename,
      });
      errors.push(...fileErrors);
    }

    // 4. If index.json changed, validate it
    if (indexChanged) {
      const indexErrors = await validateIndexJson({
        octokit,
        owner,
        repo,
        ref: headSha,
      });
      errors.push(...indexErrors);
    }

    // 5. Complete the check run
    if (errors.length === 0) {
      await octokit.rest.checks.update({
        owner,
        repo,
        check_run_id: checkRunId,
        status: "completed",
        conclusion: "success",
        completed_at: new Date().toISOString(),
        output: {
          title: "Protocol validation passed",
          summary: `Validated ${ticketFiles.length} ticket file(s)${indexChanged ? " and index.json" : ""}.`,
        },
      });
    } else {
      // Build annotations from errors
      const annotations = errors.slice(0, 50).map((e) => ({
        path: e.path,
        start_line: e.line ?? 1,
        end_line: e.line ?? 1,
        annotation_level: "failure" as const,
        message: e.message,
      }));

      await octokit.rest.checks.update({
        owner,
        repo,
        check_run_id: checkRunId,
        status: "completed",
        conclusion: "failure",
        completed_at: new Date().toISOString(),
        output: {
          title: `${errors.length} protocol violation(s)`,
          summary: `Found ${errors.length} issue(s) in ticket files. Fix them to pass this check.`,
          annotations,
        },
      });
    }
  } catch (error) {
    // Mark check as errored if something went wrong
    console.error("[protocol-check] Error:", error);
    await octokit.rest.checks.update({
      owner,
      repo,
      check_run_id: checkRunId,
      status: "completed",
      conclusion: "failure",
      completed_at: new Date().toISOString(),
      output: {
        title: "Protocol check error",
        summary: `An error occurred while validating: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
    });
  }
}

// ============================================================================
// Ticket File Validation
// ============================================================================

interface ValidateFileArgs {
  octokit: ReturnType<typeof getInstallationOctokit>;
  owner: string;
  repo: string;
  ref: string;
  path: string;
}

async function validateTicketFile(args: ValidateFileArgs): Promise<ValidationError[]> {
  const { octokit, owner, repo, ref, path } = args;
  const errors: ValidationError[] = [];

  try {
    // Fetch file content
    const res = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    if (Array.isArray(res.data) || res.data.type !== "file") {
      errors.push({ path, message: "Expected a file" });
      return errors;
    }

    const content = Buffer.from(res.data.content, "base64").toString("utf-8");

    // Parse frontmatter
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) {
      errors.push({ path, line: 1, message: "Missing YAML frontmatter (expected --- delimiters)" });
      return errors;
    }

    const fmContent = fmMatch[1];
    let frontmatter: Record<string, unknown>;
    
    try {
      // Simple YAML parsing for frontmatter
      frontmatter = parseSimpleYaml(fmContent);
    } catch (e) {
      errors.push({ path, line: 1, message: `Invalid YAML frontmatter: ${e instanceof Error ? e.message : "parse error"}` });
      return errors;
    }

    // Extract expected ID from filename
    const filenameMatch = path.match(/([A-Z0-9]{26})\.md$/i);
    const expectedId = filenameMatch?.[1]?.toUpperCase();

    // Validate required fields
    if (!frontmatter.id) {
      errors.push({ path, line: 2, message: "Missing required field: id" });
    } else if (expectedId && String(frontmatter.id).toUpperCase() !== expectedId) {
      errors.push({ path, line: 2, message: `id "${frontmatter.id}" does not match filename (expected ${expectedId})` });
    }

    if (!frontmatter.title) {
      errors.push({ path, line: 2, message: "Missing required field: title" });
    }

    if (!frontmatter.state) {
      errors.push({ path, line: 2, message: "Missing required field: state" });
    } else {
      const validStates = ["backlog", "ready", "in_progress", "blocked", "done"];
      const state = String(frontmatter.state).toLowerCase();
      if (!validStates.includes(state)) {
        errors.push({ path, line: 2, message: `Invalid state "${frontmatter.state}" (must be one of: ${validStates.join(", ")})` });
      }
    }

    if (!frontmatter.priority) {
      errors.push({ path, line: 2, message: "Missing required field: priority" });
    } else {
      const validPriorities = ["p0", "p1", "p2", "p3"];
      const priority = String(frontmatter.priority).toLowerCase();
      if (!validPriorities.includes(priority)) {
        errors.push({ path, line: 2, message: `Invalid priority "${frontmatter.priority}" (must be one of: ${validPriorities.join(", ")})` });
      }
    }

    // Validate labels if present
    if (frontmatter.labels !== undefined) {
      if (!Array.isArray(frontmatter.labels)) {
        errors.push({ path, line: 2, message: "labels must be an array" });
      } else {
        for (const label of frontmatter.labels) {
          const l = String(label).trim().toLowerCase();
          if (/\s/.test(l)) {
            errors.push({ path, line: 2, message: `Label "${label}" contains whitespace` });
          } else if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(l)) {
            errors.push({ path, line: 2, message: `Invalid label format: "${label}"` });
          }
        }
      }
    }

    // Validate assignee/reviewer if present
    for (const field of ["assignee", "reviewer"]) {
      const value = frontmatter[field];
      if (value !== undefined && value !== null) {
        const v = String(value);
        if (!v.includes(":")) {
          errors.push({ path, line: 2, message: `${field} must be in format "human:slug" or "agent:slug"` });
        } else {
          const [type] = v.split(":");
          if (type !== "human" && type !== "agent") {
            errors.push({ path, line: 2, message: `${field} type must be "human" or "agent", got "${type}"` });
          }
        }
      }
    }

  } catch (e) {
    errors.push({ path, message: `Failed to fetch file: ${e instanceof Error ? e.message : "unknown error"}` });
  }

  return errors;
}

async function validateIndexJson(args: Omit<ValidateFileArgs, "path">): Promise<ValidationError[]> {
  const { octokit, owner, repo, ref } = args;
  const errors: ValidationError[] = [];
  const path = ".tickets/index.json";

  try {
    const res = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    if (Array.isArray(res.data) || res.data.type !== "file") {
      errors.push({ path, message: "Expected a file" });
      return errors;
    }

    const content = Buffer.from(res.data.content, "base64").toString("utf-8");

    let index: { format_version?: number; tickets?: unknown[] };
    try {
      index = JSON.parse(content);
    } catch {
      errors.push({ path, line: 1, message: "Invalid JSON" });
      return errors;
    }

    if (index.format_version !== 1) {
      errors.push({ path, line: 1, message: `format_version must be 1, got ${index.format_version}` });
    }

    if (!Array.isArray(index.tickets)) {
      errors.push({ path, line: 1, message: "tickets must be an array" });
    }

  } catch (e) {
    errors.push({ path, message: `Failed to fetch file: ${e instanceof Error ? e.message : "unknown error"}` });
  }

  return errors;
}

/**
 * Simple YAML frontmatter parser.
 * Handles the subset we need: scalar values, arrays.
 */
function parseSimpleYaml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = content.split("\n");
  let currentKey: string | null = null;
  let currentArray: string[] | null = null;

  for (const line of lines) {
    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith("#")) continue;

    // Check for array item
    if (line.match(/^\s+-\s+/)) {
      if (currentArray) {
        const value = line.replace(/^\s+-\s+/, "").trim();
        currentArray.push(value);
      }
      continue;
    }

    // Check for key: value
    const kvMatch = line.match(/^([a-z_][a-z0-9_]*)\s*:\s*(.*)$/i);
    if (kvMatch) {
      // Save previous array if any
      if (currentKey && currentArray) {
        result[currentKey] = currentArray;
        currentArray = null;
      }

      const [, key, rawValue] = kvMatch;
      currentKey = key;
      const value = rawValue.trim();

      if (value === "" || value === "[]") {
        // Start of array or empty
        currentArray = [];
      } else if (value === "null" || value === "~") {
        result[key] = null;
      } else if (value.startsWith("[") && value.endsWith("]")) {
        // Inline array
        const inner = value.slice(1, -1);
        result[key] = inner ? inner.split(",").map((s) => s.trim()) : [];
      } else {
        result[key] = value;
        currentKey = null;
      }
    }
  }

  // Save final array if any
  if (currentKey && currentArray) {
    result[currentKey] = currentArray;
  }

  return result;
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
    head: { ref: string; sha: string };
    base: { ref: string };
  };
  repository: {
    full_name: string;
    owner: { login: string };
    name: string;
  };
  installation?: { id: number };
}

async function handlePullRequestEvent(payload: PullRequestPayload): Promise<{ ok: boolean; message?: string }> {
  const fullName = payload.repository.full_name;
  const pr = payload.pull_request;
  const installationId = payload.installation?.id;

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

  // Run protocol check on PR open/sync/reopen (if we have installation token)
  const shouldCheck = ["opened", "synchronize", "reopened"].includes(payload.action);
  if (shouldCheck && installationId) {
    // Fire and forget - don't block the webhook response
    runProtocolCheck({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      prNumber: pr.number,
      headSha: pr.head.sha,
      installationId,
    }).catch((err) => {
      console.error(`[webhook] Protocol check failed for PR #${pr.number}:`, err);
    });
  }

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
