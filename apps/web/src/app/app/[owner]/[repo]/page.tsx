import { redirect } from "next/navigation";
import Board from "@/components/board";
import { getAccessTokenFromCookies } from "@/lib/auth";

interface RepoBoardPageProps {
  params: Promise<{ owner: string; repo: string }>;
}

export default async function RepoBoardPage({ params }: RepoBoardPageProps) {
  const token = await getAccessTokenFromCookies();
  if (!token) {
    redirect("/");
  }

  const { owner, repo } = await params;

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <Board owner={owner} repo={repo} />
    </main>
  );
}
