export function WhySection() {
  const bullets = [
    {
      title: "No lost context",
      body: "Between runs, machines, or sessions.",
    },
    {
      title: "Inspectable and diffable",
      body: "Work is reviewable in any Git tool.",
    },
    {
      title: "Git history is the audit trail",
      body: "Every state change is a commit.",
    },
  ];

  return (
    <section className="border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Agents need durable state, not chat memory.
        </h2>
        <p className="mt-4 max-w-2xl text-muted">
          Orchestrators execute well, but they do not reliably preserve backlog
          state across runs. Ticket turns work into a durable system of record
          that agents can read and write deterministically.
        </p>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {bullets.map((b) => (
            <div
              key={b.title}
              className="rounded-lg border border-border bg-white p-6"
            >
              <h3 className="font-semibold">{b.title}</h3>
              <p className="mt-2 text-sm text-muted">{b.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
