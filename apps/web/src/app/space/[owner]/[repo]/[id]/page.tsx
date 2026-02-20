import { redirect } from "next/navigation";
import Board from "@/components/board";
import { getAccessTokenFromCookies } from "@/lib/auth";
import { buildGithubAuthPath, withSearchParams } from "@/lib/auth-return-to";

interface RepoTicketPageProps {
  params: Promise<{ owner: string; repo: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RepoTicketPage({ params, searchParams }: RepoTicketPageProps) {
  const token = await getAccessTokenFromCookies();
  const { owner, repo, id } = await params;
  const resolvedSearchParams = await searchParams;

  if (!token) {
    const pathname = `/space/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(id)}`;
    redirect(buildGithubAuthPath(withSearchParams(pathname, resolvedSearchParams)));
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <Board owner={owner} repo={repo} ticketId={id} />
    </main>
  );
}
