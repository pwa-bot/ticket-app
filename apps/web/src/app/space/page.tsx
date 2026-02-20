import { Suspense } from "react";
import PortfolioAttentionView from "@/components/portfolio-attention-view";

function SpaceFallback() {
  return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading dashboard…</div>;
}

interface DashboardHomePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DashboardHomePage({ searchParams: _searchParams }: DashboardHomePageProps) {

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <Suspense fallback={<SpaceFallback />}>
          <PortfolioAttentionView />
        </Suspense>
      </div>
    </main>
  );
}
