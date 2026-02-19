import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { getInstallationOctokit } from "@/lib/github-app";
import { upsertBlob, upsertTicketFromIndexEntry } from "@/db/sync";

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

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

interface PushPayload {
  ref: string;
  after: string;
  repository: {
    full_name: string;
    default_branch: string;
  };
  installation?: { id: number };
}

interface PullRequestPayload {
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

function verifySignature(payload: string, signature: string | null): boolean {
  if (!WEBHOOK_SECRET || !signature) return false;
  const expected = `sha256=${crypto.createHmac("sha256", WEBHOOK_SECRET).update(payload).digest("hex")}`;

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

async function recordDeliveryIfNew(deliveryId: string | null, event: string): Promise<boolean> {
  if (!deliveryId) return true;

  const rows = await db
    .insert(schema.webhookDeliveries)
    .values({ deliveryId, event })
    .onConflictDoNothing()
    .returning({ deliveryId: schema.webhookDeliveries.deliveryId });

  return rows.length > 0;
}

function extractShortIds(text: string): string[] {
  const out = new Set<string>();

  const displayRe = /\bTK-([A-Z0-9]{8})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = displayRe.exec(text))) out.add(m[1].toUpperCase());

  const branchRe = /\btk-([a-z0-9]{8})\b/gi;
  while ((m = branchRe.exec(text))) out.add(m[1].toUpperCase());

  return Array.from(out);
}

function mapChecksState(status: string | null, conclusion: string | null): "pass" | "fail" | "running" | "unknown" {
  if (!status) return "unknown";
  if (status !== "completed") return "running";
  if (!conclusion) return "unknown";
  if (conclusion === "success") return "pass";
  if (["failure", "cancelled", "timed_out", "action_required"].includes(conclusion)) return "fail";
  return "unknown";
}

async function resolveGithubInstallationId(fullName: string, fromPayload?: number): Promise<number | null> {
  if (fromPayload) return fromPayload;

  const repo = await db.query.repos.findFirst({ where: eq(schema.repos.fullName, fullName) });
  if (!repo?.installationId) return null;

  const installation = await db.query.installations.findFirst({
    where: eq(schema.installations.id, repo.installationId),
  });

  return installation?.githubInstallationId ?? null;
}

async function handlePushEvent(payload: PushPayload): Promise<{ ok: boolean; message: string }> {
  const branch = payload.ref.replace("refs/heads/", "");
  if (branch !== payload.repository.default_branch) {
    return { ok: true, message: "Ignored non-default-branch push" };
  }

  const fullName = payload.repository.full_name;
  const headSha = payload.after;
  const repo = await db.query.repos.findFirst({ where: eq(schema.repos.fullName, fullName) });
  if (!repo) {
    return { ok: true, message: "Repo not connected" };
  }

  const githubInstallationId = await resolveGithubInstallationId(fullName, payload.installation?.id);
  if (!githubInstallationId) {
    return { ok: true, message: "No installation for repo" };
  }

  const [owner, repoName] = fullName.split("/");
  const octokit = getInstallationOctokit(githubInstallationId);

  const content = await octokit.rest.repos.getContent({
    owner,
    repo: repoName,
    path: ".tickets/index.json",
    ref: payload.repository.default_branch,
  });

  if (Array.isArray(content.data) || content.data.type !== "file") {
    throw new Error("index.json is not a file");
  }

  const indexSha = content.data.sha;
  const rawIndex = Buffer.from(content.data.content, "base64").toString("utf8");

  const parsed = JSON.parse(rawIndex) as IndexJson;
  if (parsed.format_version !== 1 || !Array.isArray(parsed.tickets)) {
    throw new Error("index.json format invalid");
  }

  await upsertBlob(fullName, ".tickets/index.json", indexSha, rawIndex);

  const idsInIndex = parsed.tickets.map((t) => String(t.id).toUpperCase());
  for (const entry of parsed.tickets) {
    await upsertTicketFromIndexEntry(fullName, indexSha, headSha, entry);
  }

  if (idsInIndex.length === 0) {
    await db.delete(schema.tickets).where(eq(schema.tickets.repoFullName, fullName));
  } else {
    await db
      .delete(schema.tickets)
      .where(and(eq(schema.tickets.repoFullName, fullName), notInArray(schema.tickets.id, idsInIndex)));
  }

  await db
    .update(schema.repos)
    .set({
      headSha,
      webhookSyncedAt: new Date(),
      lastSeenHeadSha: headSha,
      lastIndexSha: indexSha,
      lastSyncedAt: new Date(),
      syncStatus: "idle",
      syncError: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.repos.fullName, fullName));

  return { ok: true, message: `Synced ${parsed.tickets.length} tickets` };
}

async function handlePullRequestEvent(payload: PullRequestPayload): Promise<{ ok: boolean; message: string }> {
  const fullName = payload.repository.full_name;
  const pr = payload.pull_request;

  const repo = await db.query.repos.findFirst({ where: eq(schema.repos.fullName, fullName) });
  if (!repo) {
    return { ok: true, message: "Repo not connected" };
  }

  const haystack = `${pr.title}\n${pr.body ?? ""}\n${pr.head.ref}`;
  const shortIds = extractShortIds(haystack);

  // Replace cached mappings for this PR with newly resolved ticket links.
  await db
    .delete(schema.ticketPrs)
    .where(and(eq(schema.ticketPrs.repoFullName, fullName), eq(schema.ticketPrs.prNumber, pr.number)));

  if (shortIds.length === 0) {
    return { ok: true, message: "PR cached with no ticket links" };
  }

  const matchedTickets = await db.query.tickets.findMany({
    where: and(eq(schema.tickets.repoFullName, fullName), inArray(schema.tickets.shortId, shortIds)),
  });

  const links = matchedTickets;

  for (const ticket of links) {
    await db
      .insert(schema.ticketPrs)
      .values({
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
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [schema.ticketPrs.repoFullName, schema.ticketPrs.ticketId, schema.ticketPrs.prNumber],
        set: {
          prUrl: pr.html_url,
          title: pr.title,
          state: pr.state,
          merged: pr.merged,
          mergeableState: pr.mergeable_state ?? null,
          headRef: pr.head.ref,
          headSha: pr.head.sha,
          updatedAt: new Date(),
        },
      });
  }

  return { ok: true, message: `Cached PR links for ${links.length} ticket(s)` };
}

async function handleCheckEvent(event: "check_run" | "check_suite", payload: CheckPayload): Promise<{ ok: boolean; message: string }> {
  const fullName = payload.repository.full_name;
  const check = event === "check_run" ? payload.check_run : payload.check_suite;
  if (!check) return { ok: true, message: "No check payload" };

  const prs = check.pull_requests ?? [];
  if (prs.length === 0) return { ok: true, message: "No PR links on check payload" };

  const checksState = mapChecksState(check.status, check.conclusion);

  for (const pr of prs) {
    await db
      .update(schema.ticketPrs)
      .set({ checksState, updatedAt: new Date() })
      .where(and(eq(schema.ticketPrs.repoFullName, fullName), eq(schema.ticketPrs.prNumber, pr.number)));
  }

  return { ok: true, message: `Updated checks for ${prs.length} PR(s)` };
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-hub-signature-256");
    const event = req.headers.get("x-github-event") ?? "";
    const deliveryId = req.headers.get("x-github-delivery");

    if (WEBHOOK_SECRET && !verifySignature(rawBody, signature)) {
      return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
    }

    const isNew = await recordDeliveryIfNew(deliveryId, event);
    if (!isNew) {
      return NextResponse.json({ ok: true, deduped: true });
    }

    const payload = JSON.parse(rawBody) as unknown;

    if (event === "push") {
      return NextResponse.json(await handlePushEvent(payload as PushPayload));
    }

    if (event === "pull_request") {
      return NextResponse.json(await handlePullRequestEvent(payload as PullRequestPayload));
    }

    if (event === "check_run" || event === "check_suite") {
      return NextResponse.json(await handleCheckEvent(event, payload as CheckPayload));
    }

    return NextResponse.json({ ok: true, message: `Ignored ${event}` });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "webhook_failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "github-webhook" });
}
