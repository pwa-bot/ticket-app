export default function CliPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-16">
      <section>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-950">A CLI designed for agents</h1>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-slate-600">
          Deterministic commands, strict validation, collision-free IDs. Your orchestrator can operate tickets without
          touching a browser.
        </p>
      </section>

      <section className="mt-12 grid gap-8 md:grid-cols-2">
        <article className="rounded-3xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-slate-900">Install</h2>
          <p className="mt-3 text-sm text-slate-600">Clone and build from source (npm package coming soon):</p>
          <pre className="mt-4 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-200">
            <code>{`git clone https://github.com/pwa-bot/ticket-app.git
cd ticket-app/apps/cli
pnpm install && pnpm build
npm link`}</code>
          </pre>
          <p className="mt-4 text-sm text-slate-600">Or install via npm (when published):</p>
          <pre className="mt-2 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-200">
            <code>{`npm i -g @ticketapp/cli`}</code>
          </pre>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-slate-900">Quick start</h2>
          <pre className="mt-4 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-200">
            <code>{`cd your-repo
ticket init
ticket new "Add paywall experiment"
git push`}</code>
          </pre>

          <h3 className="mt-6 text-base font-semibold text-slate-900">Common commands</h3>
          <pre className="mt-2 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-200">
            <code>{`ticket list --state=ready
ticket show TK-01ARZ3ND
ticket start TK-01ARZ3ND
ticket done TK-01ARZ3ND`}</code>
          </pre>
        </article>
      </section>

      <section className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 p-6">
        <h2 className="text-xl font-semibold text-slate-900">Built for non-interactive automation</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          <code className="rounded bg-slate-100 px-1">--ci</code> mode disables fuzzy matching and interactive prompts.
          Fails fast with deterministic exit codes.
        </p>
        <pre className="mt-4 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-200">
          <code>{`ticket move TK-01ARZ3ND in_progress --ci
ticket validate --ci`}</code>
        </pre>
        <ul className="mt-4 space-y-1 text-sm text-slate-700">
          <li>IDs must be exact ULID or unambiguous short ID</li>
          <li>No fuzzy title matching</li>
          <li>`ticket edit` errors in CI mode</li>
        </ul>
      </section>

      <section className="mt-8 grid gap-8 md:grid-cols-2">
        <article className="rounded-3xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-slate-900">Validation and hooks</h2>
          <pre className="mt-4 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-200">
            <code>{`ticket validate --all
ticket install-hooks`}</code>
          </pre>
        </article>
        <article className="rounded-3xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-slate-900">PR linking conventions</h2>
          <p className="mt-3 text-sm text-slate-600">Branch: `tk-{`{short_id}`}-{`{slug}`}`</p>
          <p className="mt-1 text-sm text-slate-600">PR title: `[TK-{`{short_id}`}] {`{title}`}`</p>
        </article>
      </section>

      <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold text-slate-900">FAQ</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <article>
            <h3 className="font-medium text-slate-900">Can I create tickets offline?</h3>
            <p className="mt-1 text-sm text-slate-600">Yes. Push when ready.</p>
          </article>
          <article>
            <h3 className="font-medium text-slate-900">Who owns the data?</h3>
            <p className="mt-1 text-sm text-slate-600">You do. It&apos;s in your repo.</p>
          </article>
        </div>
      </section>
    </main>
  );
}
