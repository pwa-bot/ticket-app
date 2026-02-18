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

  // Single repo selected → redirect to dedicated board view
  if (selectedRepos.length === 1) {
    const [owner, repo] = selectedRepos[0].split("/");
    redirect(`/space/${owner}/${repo}`);
  }

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
              <div className="flex items-center gap-3">
                <a
                  href="/space/settings"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1.5"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Settings
                </a>
                <a
                  href="/api/auth/logout"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Log out
                </a>
              </div>
            </header>
            <RepoSelector />
          </>
        )}
      </div>
    </main>
  );
}
