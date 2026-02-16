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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load repositories" },
      { status: 500 },
    );
  }
}
