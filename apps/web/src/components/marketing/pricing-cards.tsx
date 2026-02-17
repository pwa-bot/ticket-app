import Link from "next/link";

interface PricingTier {
  name: string;
  price: string;
  description?: string;
  features: string[];
  cta: string;
  ctaHref: string;
  highlighted?: boolean;
}

export function PricingCards({ tiers }: { tiers: PricingTier[] }) {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      {tiers.map((tier) => (
        <div
          key={tier.name}
          className={`flex flex-col rounded-xl border p-6 ${
            tier.highlighted
              ? "border-brand bg-white"
              : "border-border bg-white"
          }`}
        >
          <h3 className="text-lg font-semibold">{tier.name}</h3>
          <p className="mt-1 text-2xl font-bold">{tier.price}</p>
          {tier.description && (
            <p className="mt-2 text-sm text-muted">{tier.description}</p>
          )}
          <ul className="mt-6 flex-1 space-y-2">
            {tier.features.map((feature) => (
              <li
                key={feature}
                className="flex items-start gap-2 text-sm text-muted"
              >
                <span className="mt-0.5 text-success">✓</span>
                {feature}
              </li>
            ))}
          </ul>
          <Link
            href={tier.ctaHref}
            className={`mt-6 block rounded-lg px-4 py-2.5 text-center text-sm font-medium transition-opacity hover:opacity-80 ${
              tier.highlighted
                ? "bg-brand text-brand-fg"
                : "bg-foreground text-background"
            }`}
          >
            {tier.cta}
          </Link>
        </div>
      ))}
    </div>
  );
}
