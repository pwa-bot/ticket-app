import { redirect } from "next/navigation";
import Board from "@/components/board";
import { getAccessTokenFromCookies } from "@/lib/auth";

interface BoardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BoardPage({ searchParams }: BoardPageProps) {
  const token = await getAccessTokenFromCookies();
  if (!token) {
    redirect("/");
  }

  const resolvedSearchParams = await searchParams;
  const repoParam = resolvedSearchParams.repo;
  const repo = typeof repoParam === "string" ? repoParam : undefined;

  if (!repo) {
    redirect("/repos");
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <Board repo={repo} />
    </main>
  );
}
