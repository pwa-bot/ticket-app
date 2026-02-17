import { NextResponse } from "next/server";
import { getAccessTokenFromCookies } from "@/lib/auth";
import { clearTicketIndexCache, getTicketIndex } from "@/lib/github";

export async function GET(request: Request) {
  const token = await getAccessTokenFromCookies();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const repo = url.searchParams.get("repo");
  const refresh = url.searchParams.get("refresh") === "1";
  if (!repo) {
    return NextResponse.json({ error: "Missing repo query parameter" }, { status: 400 });
  }

  try {
    if (refresh) {
      clearTicketIndexCache(repo);
    }
    const index = await getTicketIndex(token, repo);
    return NextResponse.json(index);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load tickets" },
      { status: 500 },
    );
  }
}
