import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireSession } from "@/lib/auth";

/**
 * GET /api/github/installations
 *
 * Returns installations associated with the current user.
 * Also self-heals stale user_installations links by refreshing from GitHub.
 */
export async function GET() {
  const { userId, token } = await requireSession();

  // Best-effort refresh from GitHub to keep links accurate.
  // This fixes stale local mappings (e.g. dangling installation_id rows).
  try {
    const response = await fetch("https://api.github.com/user/installations", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });

    if (response.ok) {
      const data = (await response.json()) as {
        installations: Array<{
          id: number;
          account: { login: string; type: string } | null;
        }>;
      };

      for (const inst of data.installations) {
        const accountLogin = inst.account?.login ?? "unknown";
        const accountType = inst.account?.type ?? "User";

        const existing = await db.query.installations.findFirst({
          where: eq(schema.installations.githubInstallationId, inst.id),
        });

        let installationDbId: number;

        if (existing) {
          installationDbId = existing.id;
          await db
            .update(schema.installations)
            .set({
              githubAccountLogin: accountLogin,
              githubAccountType: accountType,
              updatedAt: new Date(),
            })
            .where(eq(schema.installations.id, existing.id));
        } else {
          const [inserted] = await db
            .insert(schema.installations)
            .values({
              githubInstallationId: inst.id,
              githubAccountLogin: accountLogin,
              githubAccountType: accountType,
            })
            .returning({ id: schema.installations.id });
          installationDbId = inserted.id;
        }

        await db
          .insert(schema.userInstallations)
          .values({ userId, installationId: installationDbId })
          .onConflictDoNothing();
      }
    }
  } catch {
    // Ignore refresh errors; fall back to DB snapshot below.
  }

  // Get installations for this user from local DB links.
  const userInstallations = await db.query.userInstallations.findMany({
    where: eq(schema.userInstallations.userId, userId),
  });

  if (userInstallations.length === 0) {
    return NextResponse.json({ installations: [] });
  }

  const installationIds = userInstallations.map((ui) => ui.installationId);
  const installations = [];

  for (const installationId of installationIds) {
    const installation = await db.query.installations.findFirst({
      where: eq(schema.installations.id, installationId),
    });
    if (installation) {
      installations.push({
        installationId: installation.githubInstallationId,
        accountLogin: installation.githubAccountLogin,
        accountType: installation.githubAccountType,
      });
    }
  }

  return NextResponse.json({ installations });
}
