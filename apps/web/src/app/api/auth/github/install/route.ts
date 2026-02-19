import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { isUnauthorizedResponse, requireSession } from "@/lib/auth";

/**
 * GET /api/auth/github/install
 * 
 * Callback after GitHub App installation.
 * GitHub redirects here with installation_id query param.
 * 
 * We record the installation in our DB so we can use installation tokens.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const installationId = url.searchParams.get("installation_id");
  const setupAction = url.searchParams.get("setup_action"); // "install" | "update"

  if (!installationId) {
    // No installation_id means user just completed OAuth without installing
    // Redirect to space
    return NextResponse.redirect(new URL("/space", request.url));
  }

  let token: string | null = null;
  try {
    ({ token } = await requireSession());
  } catch (error) {
    if (!isUnauthorizedResponse(error)) {
      throw error;
    }
  }
  
  if (token) {
    // User is logged in - fetch installation details from GitHub
    try {
      const response = await fetch(`https://api.github.com/user/installations`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      });

      if (response.ok) {
        const data = await response.json() as { 
          installations: Array<{ 
            id: number; 
            account: { login: string };
          }> 
        };
        
        // Find the installation that was just added
        const installation = data.installations.find(
          (i) => i.id === parseInt(installationId, 10)
        );

        if (installation) {
          // Record the installation
          await db
            .insert(schema.installations)
            .values({
              githubInstallationId: installation.id,
              githubAccountLogin: installation.account.login,
            })
            .onConflictDoUpdate({
              target: schema.installations.githubInstallationId,
              set: {
                githubAccountLogin: installation.account.login,
                updatedAt: new Date(),
              },
            });

          console.log(`[install] Recorded installation ${installation.id} for ${installation.account.login}`);
        }
      }
    } catch (error) {
      console.error("[install] Failed to record installation:", error);
      // Continue anyway - installation will be picked up via webhook
    }
  }

  // Redirect to space
  return NextResponse.redirect(new URL("/space", request.url));
}
