import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireSession } from "@/lib/auth";

/**
 * POST /api/github/installations/refresh
 *
 * Re-fetches the current user's GitHub App installations using their OAuth token.
 * Works with read:user scope — calls GET /user/installations.
 */
export async function POST() {
  const { userId, token } = await requireSession();

  try {
    // Use user's OAuth token to list their GitHub App installations.
    // GET /user/installations works with read:user scope.
    const response = await fetch("https://api.github.com/user/installations", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("[refresh installations] GitHub API error:", response.status, text);
      return NextResponse.json(
        { error: `GitHub API error: ${response.status}` },
        { status: 502 },
      );
    }

    const data = (await response.json()) as {
      installations: Array<{
        id: number;
        account: { login: string; type: string } | null;
      }>;
    };

    const registered = [];

    for (const inst of data.installations) {
      const account = inst.account;
      const accountLogin = account?.login ?? "unknown";
      const accountType = account?.type ?? "User";

      const existingInstallation = await db.query.installations.findFirst({
        where: eq(schema.installations.githubInstallationId, inst.id),
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
            githubInstallationId: inst.id,
            githubAccountLogin: accountLogin,
            githubAccountType: accountType,
          })
          .returning({ id: schema.installations.id });
        installationDbId = inserted.id;
      }

      // Link user to installation
      await db
        .insert(schema.userInstallations)
        .values({ userId, installationId: installationDbId })
        .onConflictDoNothing();

      registered.push({ installationId: inst.id, accountLogin, accountType });
    }

    return NextResponse.json({
      ok: true,
      installations: registered,
      count: registered.length,
    });
  } catch (error) {
    console.error("[refresh installations] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
