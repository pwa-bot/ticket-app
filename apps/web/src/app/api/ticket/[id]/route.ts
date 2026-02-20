import { apiError, apiSuccess } from "@/lib/api/response";
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
    return apiError("Missing repo query parameter", { status: 400 });
  }

  const [owner, repoName] = repo.split("/");
  if (!owner || !repoName || !(await hasRepoAccess(userId, `${owner}/${repoName}`))) {
    return apiError("Forbidden", { status: 403 });
  }

  try {
    const ticket = await getTicketById(token, repo, id);
    return apiSuccess(ticket);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to load ticket", { status: 500 });
  }
}
