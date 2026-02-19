import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { isUnauthorizedResponse, requireSession } from "@/lib/auth";
import { getCachedBlob, upsertBlob, getRepo } from "@/db/sync";
import { db, schema } from "@/db/client";

interface RouteParams {
  params: Promise<{ owner: string; repo: string; ticketId: string }>;
}

/**
 * GET /api/repos/:owner/:repo/tickets/:ticketId
 * 
 * Returns ticket metadata + markdown content.
 * Lazy-fetches and caches markdown from GitHub if not in cache.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await requireSession();

    const { owner, repo, ticketId } = await params;
    const fullName = `${owner}/${repo}`;

    // Get ticket metadata from cache
    const ticket = await db.query.tickets.findFirst({
      where: and(
        eq(schema.tickets.repoFullName, fullName),
        eq(schema.tickets.id, ticketId.toUpperCase())
      ),
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    // Try to get markdown from blob cache
    let markdown: string | null = null;
    let source: "cache" | "github" = "cache";

    const cachedBlob = await getCachedBlob(fullName, ticket.path);
    if (cachedBlob) {
      markdown = cachedBlob.contentText;
    } else {
      // Lazy-fetch from GitHub
      source = "github";
      const repoRow = await getRepo(fullName);
      const defaultBranch = repoRow?.defaultBranch ?? "main";

      const fileRes = await fetch(
        `https://api.github.com/repos/${fullName}/contents/${ticket.path}?ref=${defaultBranch}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
          },
        }
      );

      if (!fileRes.ok) {
        if (fileRes.status === 404) {
          return NextResponse.json({ error: "Ticket file not found in repo" }, { status: 404 });
        }
        return NextResponse.json(
          { error: `GitHub API error: ${fileRes.status}` },
          { status: 500 }
        );
      }

      const fileData = await fileRes.json() as { sha: string; content: string };
      markdown = Buffer.from(fileData.content, "base64").toString("utf-8");

      // Cache the blob
      await upsertBlob(fullName, ticket.path, fileData.sha, markdown);

      // Update ticket's sha reference
      await db
        .update(schema.tickets)
        .set({ ticketSha: fileData.sha })
        .where(
          and(
            eq(schema.tickets.repoFullName, fullName),
            eq(schema.tickets.id, ticket.id)
          )
        );
    }

    return NextResponse.json({
      ticket: {
        id: ticket.id,
        shortId: ticket.shortId,
        displayId: ticket.displayId,
        title: ticket.title,
        state: ticket.state,
        priority: ticket.priority,
        labels: ticket.labels,
        assignee: ticket.assignee,
        reviewer: ticket.reviewer,
        path: ticket.path,
      },
      markdown,
      source,
    });
  } catch (error) {
    if (isUnauthorizedResponse(error)) {
      return error;
    }
    console.error("[ticket-detail] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
