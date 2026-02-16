const faqs = [
  {
    q: "Do I need ticket.app to use Ticket?",
    a: "No. CLI and format work without hosted service.",
  },
  {
    q: "Who owns the data?",
    a: "You do. Tickets live in your repo.",
  },
  {
    q: "Does this work with my orchestrator?",
    a: "If it can run a CLI or commit files, yes.",
  },
];

export default function FAQSection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16">
      <h2 className="text-3xl font-semibold tracking-tight text-slate-950">FAQ</h2>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {faqs.map((faq) => (
          <article key={faq.q} className="rounded-3xl border border-slate-200 bg-white p-5">
            <h3 className="text-base font-medium text-slate-900">{faq.q}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{faq.a}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
