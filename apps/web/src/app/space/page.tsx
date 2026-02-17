import { redirect } from "next/navigation";
import MultiRepoAttention from "@/components/multi-repo-attention";
import RepoSelector from "@/components/repo-selector";
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

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-7xl">
        {selectedRepos.length > 0 ? (
          <MultiRepoAttention repos={selectedRepos} />
        ) : (
          <>
            <header className="mb-8 flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-semibold">Select Repositories</h1>
                <p className="mt-2 text-sm text-slate-600">Pick one or more repositories that contain `.tickets/index.json`.</p>
              </div>
              <a
                href="/api/auth/logout"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Log out
              </a>
            </header>
            <RepoSelector />
          </>
        )}
      </div>
    </main>
  );
}
