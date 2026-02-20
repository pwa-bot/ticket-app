import { redirect } from "next/navigation";
import PortfolioAttentionView from "@/components/portfolio-attention-view";
import { getAccessTokenFromCookies } from "@/lib/auth";

interface DashboardHomePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DashboardHomePage({ searchParams }: DashboardHomePageProps) {
  const token = await getAccessTokenFromCookies();

  if (!token) {
    redirect("/api/auth/github");
  }

  await searchParams;

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <PortfolioAttentionView />
      </div>
    </main>
  );
}
