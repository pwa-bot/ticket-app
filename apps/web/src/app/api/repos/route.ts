import { NextResponse } from "next/server";
import { getAccessTokenFromCookies } from "@/lib/auth";
import { listReposWithTickets } from "@/lib/github";

export async function GET() {
  const token = await getAccessTokenFromCookies();

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
