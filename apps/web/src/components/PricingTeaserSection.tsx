import Link from "next/link";

export default function PricingTeaserSection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16">
      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8">
        <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Pay for coordination, not users.</h2>
        <p className="mt-4 max-w-3xl leading-relaxed text-slate-600">
          Unlimited agents. No per-seat billing. Start free with the CLI, upgrade for multi-repo dashboard and team
          features.
        </p>
        <Link href="/pricing" className="mt-6 inline-flex rounded-xl bg-indigo-600 px-5 py-3 text-sm font-medium text-white">
          View pricing
        </Link>
      </div>
    </section>
  );
}
