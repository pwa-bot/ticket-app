import Board from "@/components/board";
interface RepoBoardPageProps {
  params: Promise<{ owner: string; repo: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RepoBoardPage({ params, searchParams: _searchParams }: RepoBoardPageProps) {
  const { owner, repo } = await params;

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <Board owner={owner} repo={repo} />
    </main>
  );
}
