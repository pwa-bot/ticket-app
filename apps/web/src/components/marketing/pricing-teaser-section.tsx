import Link from "next/link";

export function PricingTeaserSectionV2() {
  return (
    <section className="border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Pay for coordination, not seats.
        </h2>
        <p className="mt-4 max-w-2xl text-muted">
          The protocol is free. The CLI is open source. Upgrade for multi-repo
          portfolio views, saved filters, and team coordination features.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 sm:max-w-xl">
          <div className="rounded-lg border border-border bg-white p-5">
            <h3 className="font-semibold">Free</h3>
            <p className="mt-2 text-sm text-muted">
              CLI + Protocol + single-repo dashboard
            </p>
          </div>
          <div className="rounded-lg border border-brand bg-white p-5">
            <h3 className="font-semibold">Paid</h3>
            <p className="mt-2 text-sm text-muted">
              Multi-repo portfolio + saved views + faster refresh
            </p>
          </div>
        </div>
        <div className="mt-6">
          <Link
            href="/pricing"
            className="text-sm font-medium text-brand underline underline-offset-4 hover:text-brand/80"
          >
            Pricing
          </Link>
        </div>
      </div>
    </section>
  );
}
