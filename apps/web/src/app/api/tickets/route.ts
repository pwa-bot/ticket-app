import { NextResponse } from "next/server";
import { getAccessTokenFromCookies } from "@/lib/auth";
import { getTicketIndex } from "@/lib/github";

export async function GET(request: Request) {
  const token = await getAccessTokenFromCookies();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const repo = url.searchParams.get("repo");
  if (!repo) {
    return NextResponse.json({ error: "Missing repo query parameter" }, { status: 400 });
  }

  try {
    const index = await getTicketIndex(token, repo);
    return NextResponse.json(index);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load tickets" },
      { status: 500 },
    );
  }
}
