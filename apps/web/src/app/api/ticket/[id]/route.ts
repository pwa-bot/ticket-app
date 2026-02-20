import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getTicketById } from "@/lib/github";
import { hasRepoAccess } from "@/lib/security/repo-access";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const { token, userId } = await requireSession();

  const { id } = await params;
  const url = new URL(request.url);
  const repo = url.searchParams.get("repo");

  if (!repo) {
    return NextResponse.json({ error: "Missing repo query parameter" }, { status: 400 });
  }

  const [owner, repoName] = repo.split("/");
  if (!owner || !repoName || !(await hasRepoAccess(userId, `${owner}/${repoName}`))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const ticket = await getTicketById(token, repo, id);
    return NextResponse.json(ticket);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load ticket" },
      { status: 500 },
    );
  }
}
