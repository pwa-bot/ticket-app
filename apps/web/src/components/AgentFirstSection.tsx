export default function AgentFirstSection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16">
      <div className="grid gap-10 md:grid-cols-2 md:items-start">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Deterministic CLI. No flakey automation.</h2>
          <p className="mt-4 leading-relaxed text-slate-600">
            Agents should not need a browser. Ticket exposes a predictable CLI with <code className="rounded bg-slate-100 px-1">--ci</code> mode for strict, non-interactive workflows.
          </p>
          <ul className="mt-6 space-y-2 text-slate-700">
            <li>Collision-free IDs (ULID filenames)</li>
            <li>Strict parsing and validation</li>
            <li>Git hooks to prevent broken tickets from landing</li>
          </ul>
        </div>
        <pre className="overflow-auto rounded-3xl border border-slate-200 bg-slate-950 p-5 text-xs text-slate-200">
          <code>{`ticket init
ticket new "Add paywall experiment"
ticket move TK-01ARZ3ND in_progress
ticket validate --ci`}</code>
        </pre>
      </div>
    </section>
  );
}
