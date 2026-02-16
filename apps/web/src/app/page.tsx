import { redirect } from "next/navigation";
import { getAccessTokenFromCookies } from "@/lib/auth";

export default async function HomePage() {
  const token = await getAccessTokenFromCookies();

  if (token) {
    redirect("/board");
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 text-slate-900">
      <section className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-6 py-24 text-center">
        <p className="mb-4 rounded-full border border-slate-300 bg-white px-4 py-1 text-xs font-semibold uppercase tracking-wider text-slate-600">
          ticket.app dashboard
        </p>
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Read-only Kanban view for your Git-native tickets
        </h1>
        <p className="mt-6 max-w-xl text-base text-slate-600 sm:text-lg">
          Connect GitHub, choose a repository with `.tickets/`, and review board status without leaving the browser.
        </p>
        <a
          href="/api/auth/github"
          className="mt-10 inline-flex items-center justify-center rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          Sign in with GitHub
        </a>
      </section>
    </main>
  );
}
