import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { getCurrentUserId } from "@/lib/auth";

/**
 * GET /api/github/installations
 * 
 * Returns installations associated with the current user.
 */
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get installations for this user
  const userInstallations = await db.query.userInstallations.findMany({
    where: eq(schema.userInstallations.userId, userId),
  });

  if (userInstallations.length === 0) {
    return NextResponse.json({ installations: [] });
  }

  // Fetch installation details
  const installationIds = userInstallations.map(ui => ui.installationId);
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
