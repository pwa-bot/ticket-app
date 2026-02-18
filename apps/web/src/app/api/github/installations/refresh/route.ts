import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { getCurrentUserId, getAccessTokenFromCookies, getSession } from "@/lib/auth";
import { getAppOctokit } from "@/lib/github-app";

/**
 * POST /api/github/installations/refresh
 * 
 * Find GitHub App installations for the current user.
 * Uses the App's own API to list installations, then matches by account login.
 */
export async function POST() {
  const userId = await getCurrentUserId();
  const session = await getSession();
  
  if (!userId || !session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let githubLogin = session.githubLogin;
  const token = await getAccessTokenFromCookies();
  
  // If githubLogin is unknown (legacy session), fetch it from GitHub
  if (!githubLogin || githubLogin === "unknown") {
    if (!token) {
      return NextResponse.json({ error: "Cannot determine GitHub login" }, { status: 400 });
    }
    try {
      const userResponse = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      });
      if (userResponse.ok) {
        const userData = await userResponse.json() as { login: string };
        githubLogin = userData.login;
      } else {
        return NextResponse.json({ error: "Failed to fetch GitHub user info" }, { status: 502 });
      }
    } catch (e) {
      console.error("[refresh installations] Failed to fetch user:", e);
      return NextResponse.json({ error: "Failed to fetch GitHub user info" }, { status: 502 });
    }
  }
  
  // Also fetch user's orgs to match org installations
  let userOrgs: string[] = [];
  
  if (token) {
    try {
      const orgsResponse = await fetch("https://api.github.com/user/orgs", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      });
      if (orgsResponse.ok) {
        const orgsData = await orgsResponse.json() as Array<{ login: string }>;
        userOrgs = orgsData.map(o => o.login.toLowerCase());
      }
    } catch (e) {
      console.error("[refresh installations] Failed to fetch orgs:", e);
    }
  }

  try {
    // Use App authentication to list ALL installations of our app
    const octokit = getAppOctokit();
    const { data } = await octokit.rest.apps.listInstallations({ per_page: 100 });
    
    // Filter to installations that belong to this user or their orgs
    const userLogins = new Set([
      githubLogin.toLowerCase(),
      ...userOrgs,
    ]);
    
    const userInstallations = data.filter(inst => {
      const accountLogin = (inst.account as { login?: string })?.login?.toLowerCase();
      return accountLogin && userLogins.has(accountLogin);
    });
    
    console.log("[refresh installations]", {
      githubLogin,
      userOrgs,
      totalInstallations: data.length,
      matchedInstallations: userInstallations.length,
    });

    const registered = [];

    for (const inst of userInstallations) {
      const account = inst.account as { login: string; type: string };
      
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
            githubAccountLogin: account.login,
            githubAccountType: account.type,
            updatedAt: new Date(),
          })
          .where(eq(schema.installations.id, existingInstallation.id));
      } else {
        const [inserted] = await db
          .insert(schema.installations)
          .values({
            githubInstallationId: inst.id,
            githubAccountLogin: account.login,
            githubAccountType: account.type,
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
        accountLogin: account.login,
        accountType: account.type,
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
