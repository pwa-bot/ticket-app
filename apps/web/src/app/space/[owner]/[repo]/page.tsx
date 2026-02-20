import { redirect } from "next/navigation";
import Board from "@/components/board";
import { getAccessTokenFromCookies } from "@/lib/auth";
import { buildGithubAuthPath, withSearchParams } from "@/lib/auth-return-to";

interface RepoBoardPageProps {
  params: Promise<{ owner: string; repo: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RepoBoardPage({ params, searchParams }: RepoBoardPageProps) {
  const token = await getAccessTokenFromCookies();
  const { owner, repo } = await params;
  const resolvedSearchParams = await searchParams;

  if (!token) {
    const pathname = `/space/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    redirect(buildGithubAuthPath(withSearchParams(pathname, resolvedSearchParams)));
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <Board owner={owner} repo={repo} />
    </main>
  );
}
