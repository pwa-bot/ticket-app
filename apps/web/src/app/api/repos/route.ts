import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAccessTokenFromCookies } from "@/lib/auth";
import { listReposWithTickets } from "@/lib/github";

export async function GET() {
  // Debug: check if we have the session cookie at all
  const store = await cookies();
  const hasSessionCookie = store.has("ticket_app_session");
  const hasSecret = !!process.env.NEXTAUTH_SECRET;
  
  const token = await getAccessTokenFromCookies();

  if (!token) {
    console.error("[/api/repos] Auth failed:", { hasSessionCookie, hasSecret });
    return NextResponse.json({ 
      error: "Unauthorized",
      debug: { hasSessionCookie, hasSecret }
    }, { status: 401 });
  }

  try {
    const repos = await listReposWithTickets(token);
    return NextResponse.json({ repos });
  } catch (error) {
    console.error("[/api/repos] Error loading repositories:", error);
    const message = error instanceof Error ? error.message : "Failed to load repositories";
    // If it's a GitHub auth error, suggest re-login
    const isAuthError = message.includes("401") || message.includes("403");
    return NextResponse.json(
      { 
        error: isAuthError 
          ? "GitHub authentication expired. Please log out and log back in." 
          : message 
      },
      { status: isAuthError ? 401 : 500 },
    );
  }
}
