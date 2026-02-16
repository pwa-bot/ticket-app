const tiers = [
  {
    name: "Free",
    price: "$0",
    points: [
      "CLI (open source)",
      "Repo-native format (.tickets/)",
      "Single-repo dashboard view",
      "Board + list views",
      "PR linking by convention",
    ],
    bestFor: "solo builders, trying the protocol",
  },
  {
    name: "Pro",
    price: "$5/repo/month",
    points: [
      "Everything in Free",
      "Multi-repo dashboard",
      "Saved views and filters",
      "Faster refresh (webhooks)",
      "Team-ready sharing (read-only links)",
    ],
    bestFor: "teams with a handful of active repos",
  },
  {
    name: "Team",
    price: "$20/month flat",
    points: [
      "Everything in Pro",
      "Unlimited repos",
      "Org-level portfolio view",
      "Slack notifications",
      "Activity feed (derived from Git)",
    ],
    bestFor: "small studios shipping multiple apps",
  },
  {
    name: "Business",
    price: "$50/month",
    points: [
      "Everything in Team",
      "Policy checks (GitHub checks)",
      "Required review enforcement",
      "Advanced analytics",
      "Priority support",
    ],
    bestFor: "teams that need guardrails",
  },
];

export default function PricingPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-16">
      <section>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-950">Pricing that doesn&apos;t punish agents</h1>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-slate-600">
          Unlimited agents. No per-seat fees. Start free with the CLI. Upgrade for multi-repo visibility and
          coordination.
        </p>
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-2">
        {tiers.map((tier) => (
          <article key={tier.name} className="rounded-3xl border border-slate-200 bg-white p-6">
            <h2 className="text-xl font-semibold text-slate-900">
              {tier.name} <span className="text-slate-500">{tier.price}</span>
            </h2>
            <ul className="mt-4 space-y-2 text-sm text-slate-700">
              {tier.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-slate-500">
              <strong className="font-medium text-slate-700">Best for:</strong> {tier.bestFor}
            </p>
          </article>
        ))}
      </section>

      <section className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 p-6">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">FAQ</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <article>
            <h3 className="font-medium text-slate-900">What happens if I stop paying?</h3>
            <p className="mt-1 text-sm text-slate-600">Nothing breaks. Tickets still in repo. CLI still works.</p>
          </article>
          <article>
            <h3 className="font-medium text-slate-900">Do agents cost extra?</h3>
            <p className="mt-1 text-sm text-slate-600">No. Unlimited agents.</p>
          </article>
          <article>
            <h3 className="font-medium text-slate-900">Why not per-seat?</h3>
            <p className="mt-1 text-sm text-slate-600">
              Agent teams scale users artificially. We price on repos and coordination.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
