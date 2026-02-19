import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireSession } from "@/lib/auth";
import { getAppOctokit } from "@/lib/github-app";

/**
 * POST /api/github/installations/register
 * 
 * Register an installation after user installs the GitHub App.
 */
export async function POST(req: NextRequest) {
  const { userId } = await requireSession();

  const body = await req.json();
  const { installationId } = body as { installationId?: number };

  if (!installationId || typeof installationId !== "number") {
    return NextResponse.json({ error: "installationId required" }, { status: 400 });
  }

  try {
    // Fetch installation details from GitHub
    const octokit = getAppOctokit();
    const { data: installation } = await octokit.rest.apps.getInstallation({
      installation_id: installationId,
    });

    const account = installation.account as { login?: string; type?: string } | null;
    const accountLogin = account?.login ?? "unknown";
    const accountType = account?.type ?? "User";

    // Upsert installation
    const existingInstallation = await db.query.installations.findFirst({
      where: eq(schema.installations.githubInstallationId, installationId),
    });

    let installationDbId: number;

    if (existingInstallation) {
      installationDbId = existingInstallation.id;
      await db
        .update(schema.installations)
        .set({
          githubAccountLogin: accountLogin,
          githubAccountType: accountType,
          updatedAt: new Date(),
        })
        .where(eq(schema.installations.id, existingInstallation.id));
    } else {
      const [inserted] = await db
        .insert(schema.installations)
        .values({
          githubInstallationId: installationId,
          githubAccountLogin: accountLogin,
          githubAccountType: accountType,
        })
        .returning({ id: schema.installations.id });
      installationDbId = inserted.id;
    }

    // Link user to installation
    await db
      .insert(schema.userInstallations)
      .values({
        userId,
        installationId: installationDbId,
      })
      .onConflictDoNothing();

    return NextResponse.json({
      ok: true,
      installation: {
        installationId,
        accountLogin,
        accountType,
      },
    });
  } catch (error) {
    console.error("[register installation] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to register installation" },
      { status: 500 }
    );
  }
}
