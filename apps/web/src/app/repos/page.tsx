import { redirect } from "next/navigation";
import RepoPicker from "@/components/repo-picker";
import { getAccessTokenFromCookies } from "@/lib/auth";

export default async function ReposPage() {
  const token = await getAccessTokenFromCookies();

  if (!token) {
    redirect("/");
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Select Repository</h1>
            <p className="mt-2 text-sm text-slate-600">Pick a repository that contains `.tickets/index.json`.</p>
          </div>
          <a
            href="/api/auth/logout"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Log out
          </a>
        </header>
        <RepoPicker />
      </div>
    </main>
  );
}
