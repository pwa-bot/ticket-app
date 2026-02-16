import Link from "next/link";

const steps = [
  "CLI generates .tickets/index.json on every change",
  "Dashboard reads index.json for board and list views",
  "Clicking a ticket loads the Markdown file and renders it",
  "PRs link automatically by branch and title convention",
];

export default function DashboardPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-16">
      <section>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-950">A dashboard that reads straight from Git</h1>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-slate-600">
          Ticket&apos;s dashboard is a fast view over `.tickets/index.json` and your ticket files. No separate source of
          truth. No syncing your backlog into a SaaS.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/dashboard" className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-medium text-white">
            Connect GitHub
          </Link>
          <Link href="/docs" className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-medium text-slate-900">
            Read the docs
          </Link>
        </div>
        <p className="mt-4 text-sm text-slate-500">Read-only in v1. Edit via CLI and git.</p>
      </section>

      <section className="mt-10 rounded-3xl border border-slate-200 bg-white p-6">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Repo-native by design</h2>
        <p className="mt-3 max-w-3xl text-slate-600">
          The dashboard loads one file, then fetches individual tickets only when you open them.
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-slate-700">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <article className="rounded-3xl border border-slate-200 bg-white p-5">
          <h3 className="font-semibold text-slate-900">Board view</h3>
          <p className="mt-2 text-sm text-slate-600">Columns = workflow states</p>
        </article>
        <article className="rounded-3xl border border-slate-200 bg-white p-5">
          <h3 className="font-semibold text-slate-900">List view</h3>
          <p className="mt-2 text-sm text-slate-600">Filter by state, priority, label, repo</p>
        </article>
        <article className="rounded-3xl border border-slate-200 bg-white p-5">
          <h3 className="font-semibold text-slate-900">Ticket detail</h3>
          <p className="mt-2 text-sm text-slate-600">Rendered Markdown plus linked PRs</p>
        </article>
      </section>

      <section className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 p-6">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">PRs connect themselves</h2>
        <p className="mt-3 text-slate-600">
          If your branch and PR title follow the convention, Ticket links them automatically.
        </p>
        <p className="mt-4 text-sm text-slate-700">Branch: `tk-{`{short_id}`}-{`{slug}`}`</p>
        <p className="mt-1 text-sm text-slate-700">PR title: `[TK-{`{short_id}`}] {`{title}`}`</p>
      </section>

      <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">See all work across repos</h2>
        <p className="mt-3 text-slate-600">
          On Pro and Team, you can view tickets across multiple repos in one place, with saved filters and views.
        </p>
        <p className="mt-2 text-sm text-slate-500">Your tickets still live in each repo.</p>
      </section>

      <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">FAQ</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <article>
            <h3 className="font-medium text-slate-900">Does Ticket store my tickets?</h3>
            <p className="mt-1 text-sm text-slate-600">No. Tickets live in your repo. The dashboard reads and renders them.</p>
          </article>
          <article>
            <h3 className="font-medium text-slate-900">What permissions does the dashboard need?</h3>
            <p className="mt-1 text-sm text-slate-600">Read access to selected repos only. It does not write to your repo in v1.</p>
          </article>
          <article>
            <h3 className="font-medium text-slate-900">How does it stay up to date?</h3>
            <p className="mt-1 text-sm text-slate-600">MVP supports manual refresh. Paid plans can enable webhooks for instant refresh.</p>
          </article>
        </div>
      </section>

      <section className="mt-8 rounded-3xl border border-slate-200 bg-slate-950 p-8 text-slate-100">
        <h2 className="text-3xl font-semibold tracking-tight">Get a clean portfolio view without leaving Git.</h2>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/dashboard" className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-medium text-white">
            Connect GitHub
          </Link>
          <Link href="/pricing" className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-medium text-slate-100">
            View pricing
          </Link>
        </div>
      </section>
    </main>
  );
}
