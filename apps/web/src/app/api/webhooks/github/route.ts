import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { syncRepoTickets, isRepoConnected } from "@/db/sync";
import { getTicketIndex } from "@/lib/github";

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

export async function POST(req: NextRequest) {
  try {
    const payload = await req.text();
    const signature = req.headers.get("x-hub-signature-256");
    const event = req.headers.get("x-github-event");

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

    console.log(`[webhook] Syncing ${repoFullName} after push`);

    // We need a token to fetch from GitHub - use a service token or stored user token
    // For now, we'll rely on the user's next request to trigger sync
    // TODO: Store and use repo owner's token for background syncs
    
    return NextResponse.json({ 
      message: "Sync queued",
      repo: repoFullName,
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
