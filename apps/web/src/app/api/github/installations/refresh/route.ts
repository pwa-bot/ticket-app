import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { getCurrentUserId, getAccessTokenFromCookies } from "@/lib/auth";

/**
 * POST /api/github/installations/refresh
 * 
 * Re-fetch user's GitHub App installations from GitHub API.
 * Useful when user installs the app while already logged in.
 */
export async function POST() {
  const userId = await getCurrentUserId();
  const token = await getAccessTokenFromCookies();
  
  if (!userId || !token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const installationsResponse = await fetch(
      "https://api.github.com/user/installations",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    if (!installationsResponse.ok) {
      const text = await installationsResponse.text();
      console.error("[refresh installations] GitHub API error:", text);
      return NextResponse.json(
        { error: "Failed to fetch installations from GitHub" },
        { status: 502 }
      );
    }

    const installationsData = (await installationsResponse.json()) as {
      installations: Array<{
        id: number;
        account: { login: string; type: string };
      }>;
    };

    const registered = [];

    for (const inst of installationsData.installations) {
      const existingInstallation = await db.query.installations.findFirst({
        where: eq(schema.installations.githubInstallationId, inst.id),
      });

      let installationDbId: number;

      if (existingInstallation) {
        installationDbId = existingInstallation.id;
        // Update account info in case it changed
        await db
          .update(schema.installations)
          .set({
            githubAccountLogin: inst.account.login,
            githubAccountType: inst.account.type,
            updatedAt: new Date(),
          })
          .where(eq(schema.installations.id, existingInstallation.id));
      } else {
        const [inserted] = await db
          .insert(schema.installations)
          .values({
            githubInstallationId: inst.id,
            githubAccountLogin: inst.account.login,
            githubAccountType: inst.account.type,
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

      registered.push({
        installationId: inst.id,
        accountLogin: inst.account.login,
        accountType: inst.account.type,
      });
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
      { status: 500 }
    );
  }
}
