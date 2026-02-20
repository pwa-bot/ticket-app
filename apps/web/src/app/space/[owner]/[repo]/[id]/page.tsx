import Board from "@/components/board";
interface RepoTicketPageProps {
  params: Promise<{ owner: string; repo: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RepoTicketPage({ params, searchParams: _searchParams }: RepoTicketPageProps) {
  const { owner, repo, id } = await params;

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <Board owner={owner} repo={repo} ticketId={id} />
    </main>
  );
}
