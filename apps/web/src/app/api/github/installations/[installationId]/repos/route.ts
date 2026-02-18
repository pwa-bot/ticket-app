import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { getCurrentUserId } from "@/lib/auth";
import { getInstallationOctokit } from "@/lib/github-app";
import { randomBytes } from "node:crypto";

interface Params {
  params: Promise<{ installationId: string }>;
}

function generateUlid(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(10).toString("hex");
  return `${timestamp}${random}`.toUpperCase().slice(0, 26);
}

/**
 * GET /api/github/installations/:installationId/repos
 * 
 * Lists repos accessible to the installation.
 * Uses installation token (not user OAuth).
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { installationId: installationIdStr } = await params;
  const githubInstallationId = parseInt(installationIdStr, 10);

  if (isNaN(githubInstallationId)) {
    return NextResponse.json({ error: "Invalid installation ID" }, { status: 400 });
  }

  // Verify user has access to this installation
  const installation = await db.query.installations.findFirst({
    where: eq(schema.installations.githubInstallationId, githubInstallationId),
  });

  if (!installation) {
    return NextResponse.json({ error: "Installation not found" }, { status: 404 });
  }

  const userInstallation = await db.query.userInstallations.findFirst({
    where: and(
      eq(schema.userInstallations.userId, userId),
      eq(schema.userInstallations.installationId, installation.id),
    ),
  });

  if (!userInstallation) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  try {
    // Fetch repos from GitHub using installation token
    const octokit = getInstallationOctokit(githubInstallationId);
    const { data } = await octokit.rest.apps.listReposAccessibleToInstallation({
      per_page: 100,
    });

    const ghRepos = data.repositories;

    // Upsert repos in database
    for (const ghRepo of ghRepos) {
      const fullName = ghRepo.full_name;
      const existing = await db.query.repos.findFirst({
        where: eq(schema.repos.fullName, fullName),
      });

      if (!existing) {
        await db.insert(schema.repos).values({
          id: generateUlid(),
          installationId: installation.id,
          owner: ghRepo.owner.login,
          repo: ghRepo.name,
          fullName,
          defaultBranch: ghRepo.default_branch ?? "main",
          enabled: false,
        });
      } else if (!existing.installationId) {
        // Update legacy repo to link to installation
        await db
          .update(schema.repos)
          .set({ installationId: installation.id, updatedAt: new Date() })
          .where(eq(schema.repos.id, existing.id));
      }
    }

    // Fetch repos with sync state
    const repos = await db.query.repos.findMany({
      where: eq(schema.repos.installationId, installation.id),
    });

    // Check which repos have .tickets/index.json
    const reposWithStatus = await Promise.all(
      repos.map(async (repo) => {
        let hasTicketsIndex: boolean | null = null;
        
        try {
          // Check if repo has .tickets/index.json
          await octokit.rest.repos.getContent({
            owner: repo.owner,
            repo: repo.repo,
            path: ".tickets/index.json",
          });
          hasTicketsIndex = true;
        } catch {
          hasTicketsIndex = false;
        }

        // Get sync state
        const syncState = await db.query.repoSyncState.findFirst({
          where: eq(schema.repoSyncState.repoId, repo.id),
        });

        return {
          owner: repo.owner,
          repo: repo.repo,
          fullName: repo.fullName,
          defaultBranch: repo.defaultBranch,
          enabled: repo.enabled,
          hasTicketsIndex,
          sync: syncState ? {
            status: syncState.status,
            lastSyncedAt: syncState.lastSyncedAt?.toISOString(),
            errorCode: syncState.errorCode,
            errorMessage: syncState.errorMessage,
          } : null,
        };
      })
    );

    return NextResponse.json({ repos: reposWithStatus });
  } catch (error) {
    console.error("[list installation repos] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list repos" },
      { status: 500 }
    );
  }
}
