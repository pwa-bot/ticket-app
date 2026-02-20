import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireSession } from "@/lib/auth";
import { syncRepo } from "@/db/sync";
import { getInstallationOctokit } from "@/lib/github-app";
import { applyMutationGuards } from "@/lib/security/mutation-guard";
import { hasRepoAccess } from "@/lib/security/repo-access";

/**
 * POST /api/repos/enable
 * 
 * Enable or disable a repo for indexing.
 * Triggers initial sync when enabling.
 */
export async function POST(req: NextRequest) {
  const { userId } = await requireSession();

  const body = await req.json();
  const { owner, repo, enabled } = body as { owner?: string; repo?: string; enabled?: boolean };

  if (!owner || !repo || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "owner, repo, and enabled are required" }, { status: 400 });
  }

  const fullName = `${owner}/${repo}`;
  const guard = applyMutationGuards({
    request: req,
    bucket: "repos-enable",
    identity: userId,
    limit: 15,
    windowMs: 60_000,
  });
  if (guard) {
    return guard;
  }

  if (!(await hasRepoAccess(userId, fullName))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Find the repo
  const repoRow = await db.query.repos.findFirst({
    where: eq(schema.repos.fullName, fullName),
  });

  if (!repoRow) {
    return NextResponse.json({ error: "Repo not found" }, { status: 404 });
  }

  // Verify user has access via installation
  if (repoRow.installationId) {
    const userInstallation = await db.query.userInstallations.findFirst({
      where: and(
        eq(schema.userInstallations.userId, userId),
        eq(schema.userInstallations.installationId, repoRow.installationId),
      ),
    });

    if (!userInstallation) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Update enabled status
  await db
    .update(schema.repos)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(schema.repos.id, repoRow.id));

  // If enabling, trigger initial sync
  if (enabled && repoRow.installationId) {
    try {
      // Get installation for this repo
      const installation = await db.query.installations.findFirst({
        where: eq(schema.installations.id, repoRow.installationId),
      });

      if (installation) {
        // Create installation token and sync
        const octokit = getInstallationOctokit(installation.githubInstallationId);
        
        // Get an installation token
        const { token } = await octokit.auth({ type: "installation" }) as { token: string };
        
        // Trigger sync with installation token
        await syncRepo(fullName, token, true);
      }
    } catch (error) {
      console.error("[enable repo] Sync error:", error);
      // Don't fail the enable, just log
    }
  }

  return NextResponse.json({ ok: true });
}
