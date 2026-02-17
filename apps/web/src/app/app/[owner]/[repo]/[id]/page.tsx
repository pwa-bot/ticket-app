import { redirect } from "next/navigation";
import Board from "@/components/board";
import { getAccessTokenFromCookies } from "@/lib/auth";

interface RepoTicketPageProps {
  params: Promise<{ owner: string; repo: string; id: string }>;
}

export default async function RepoTicketPage({ params }: RepoTicketPageProps) {
  const token = await getAccessTokenFromCookies();
  if (!token) {
    redirect("/");
  }

  const { owner, repo, id } = await params;

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <Board owner={owner} repo={repo} ticketId={id} />
    </main>
  );
}
