import { redirect } from "next/navigation";
import MultiRepoAttention from "@/components/multi-repo-attention";
import PortfolioAttentionView from "@/components/portfolio-attention-view";
import { getAccessTokenFromCookies } from "@/lib/auth";

interface DashboardHomePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function parseRepoSelection(value: string | string[] | undefined): string[] {
  const first = Array.isArray(value) ? value[0] : value;
  if (!first) {
    return [];
  }

  return Array.from(
    new Set(
      first
        .split(",")
        .map((repo) => repo.trim())
        .filter((repo) => repo.includes("/")),
    ),
  );
}

export default async function DashboardHomePage({ searchParams }: DashboardHomePageProps) {
  const token = await getAccessTokenFromCookies();

  if (!token) {
    redirect("/");
  }

  const resolvedSearchParams = await searchParams;
  const selectedRepos = parseRepoSelection(resolvedSearchParams.repos);

  // Single repo selected → redirect to dedicated board view
  if (selectedRepos.length === 1) {
    const [owner, repo] = selectedRepos[0].split("/");
    redirect(`/space/${owner}/${repo}`);
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-7xl">
        {selectedRepos.length > 1 ? (
          // Legacy: explicit multi-repo selection via ?repos= param
          <MultiRepoAttention repos={selectedRepos} />
        ) : (
          // Default: portfolio attention view (all enabled repos, Postgres-only)
          <PortfolioAttentionView />
        )}
      </div>
    </main>
  );
}
