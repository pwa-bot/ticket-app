import { redirect } from "next/navigation";
import PortfolioAttentionView from "@/components/portfolio-attention-view";
import { hasSessionCookie } from "@/lib/auth";
import { buildGithubAuthPath, withSearchParams } from "@/lib/auth-return-to";

interface DashboardHomePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DashboardHomePage({ searchParams }: DashboardHomePageProps) {
  const hasSession = await hasSessionCookie();
  const resolvedSearchParams = await searchParams;

  if (!hasSession) {
    redirect(buildGithubAuthPath(withSearchParams("/space", resolvedSearchParams)));
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <PortfolioAttentionView />
      </div>
    </main>
  );
}
