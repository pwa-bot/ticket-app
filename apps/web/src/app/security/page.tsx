import Link from "next/link";

export default function SecurityPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-16">
      <section>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-950">Security by design</h1>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-slate-600">
          Ticket keeps your backlog in Git. The hosted dashboard is an optional overlay and does not become your source
          of truth.
        </p>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        <article className="rounded-3xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-slate-900">Your tickets live in your repo</h2>
          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            <li>Ticket files live under `.tickets/` in your repository</li>
            <li>Git history is the audit log</li>
            <li>The dashboard renders what&apos;s already in Git</li>
          </ul>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-slate-900">GitHub OAuth tokens are protected</h2>
          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            <li>Tokens are stored server-side only</li>
            <li>Tokens are encrypted at rest</li>
            <li>Tokens are never logged</li>
            <li>We request the minimum access needed for selected repos</li>
          </ul>
          <p className="mt-3 text-sm text-slate-600">If access is revoked or expired, we stop indexing and prompt you to reconnect.</p>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-slate-900">No write access required</h2>
          <p className="mt-3 text-sm text-slate-600">In v1, the dashboard is read-only:</p>
          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            <li>It does not edit ticket files</li>
            <li>It does not merge PRs</li>
            <li>It does not modify your repo</li>
          </ul>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-slate-900">Verified, signed, and replay-safe</h2>
          <p className="mt-3 text-sm text-slate-600">When webhooks are enabled:</p>
          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            <li>Webhook signatures are verified</li>
            <li>Deliveries are deduplicated by delivery ID</li>
            <li>Replay attempts are rejected</li>
          </ul>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-slate-900">Least privilege repo indexing</h2>
          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            <li>Only repos you explicitly select are indexed</li>
            <li>We respect GitHub permissions</li>
            <li>If access changes, indexing stops for that repo</li>
          </ul>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-slate-900">Built for agent-heavy workflows</h2>
          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            <li>The CLI provides strict validation for safe automation</li>
            <li>`--ci` mode disables interactive and fuzzy behavior</li>
            <li>Git hooks prevent malformed tickets from landing</li>
          </ul>
        </article>
      </section>

      <section className="mt-8 rounded-3xl border border-slate-200 bg-slate-950 p-8 text-slate-100">
        <h2 className="text-3xl font-semibold tracking-tight">Keep your workflow in Git. Add an overlay when you want it.</h2>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/docs" className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-medium text-slate-100">
            Read the docs
          </Link>
          <Link href="/dashboard" className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-medium text-white">
            Connect GitHub
          </Link>
        </div>
      </section>
    </main>
  );
}
