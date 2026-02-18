import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { isRepoConnected } from "@/db/sync";

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

interface PushPayload {
  ref: string;
  repository: {
    full_name: string;
    default_branch: string;
  };
  commits?: Array<{
    added: string[];
    modified: string[];
    removed: string[];
  }>;
  head_commit?: {
    id: string;
  };
}

function verifySignature(payload: string, signature: string | null): boolean {
  if (!WEBHOOK_SECRET || !signature) return false;
  
  const expected = `sha256=${crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(payload)
    .digest("hex")}`;
  
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function affectsTickets(commits: PushPayload["commits"]): boolean {
  if (!commits) return false;
  
  return commits.some((commit) => {
    const allPaths = [...commit.added, ...commit.modified, ...commit.removed];
    return allPaths.some((path) => path.startsWith(".tickets/"));
  });
}

/**
 * POST /api/webhooks/github
 * 
 * Receives push events from GitHub.
 * When .tickets/ files change, marks repo for sync.
 * 
 * Note: We can't actually sync here without a stored token.
 * For now, we just acknowledge the webhook. The next user request
 * will trigger sync due to stale cache.
 * 
 * TODO: With GitHub App, we can use installation tokens for background sync.
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await req.text();
    const signature = req.headers.get("x-hub-signature-256");
    const event = req.headers.get("x-github-event");
    const deliveryId = req.headers.get("x-github-delivery");

    // Verify webhook signature
    if (WEBHOOK_SECRET && !verifySignature(payload, signature)) {
      console.error("[webhook] Invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Only handle push events
    if (event !== "push") {
      return NextResponse.json({ message: `Ignored event: ${event}` });
    }

    const data = JSON.parse(payload) as PushPayload;
    const repoFullName = data.repository.full_name;
    const defaultBranch = data.repository.default_branch;

    // Only process pushes to default branch
    if (data.ref !== `refs/heads/${defaultBranch}`) {
      return NextResponse.json({ message: "Ignored non-default branch push" });
    }

    // Check if repo is connected
    const connected = await isRepoConnected(repoFullName);
    if (!connected) {
      return NextResponse.json({ message: "Repo not connected" });
    }

    // Check if push affects .tickets/
    if (!affectsTickets(data.commits)) {
      return NextResponse.json({ message: "No ticket changes" });
    }

    console.log(`[webhook] Push to ${repoFullName} affects .tickets/ (delivery: ${deliveryId})`);

    // We've detected a change. Options:
    // 1. With GitHub App: use installation token to sync now
    // 2. With OAuth: can't sync without user token, mark for refresh
    // 
    // For now, we just log it. The next user request will see stale cache
    // and trigger a sync. When we add GitHub App support, we can sync here.

    return NextResponse.json({ 
      message: "Webhook received",
      repo: repoFullName,
      headCommit: data.head_commit?.id,
      ticketsAffected: true,
    });
  } catch (error) {
    console.error("[webhook] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// GitHub sends a GET to verify the webhook URL
export async function GET() {
  return NextResponse.json({ status: "ok", service: "ticket.app webhook" });
}
