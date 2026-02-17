import type { Metadata } from "next";
import Link from "next/link";
import { PricingCards } from "@/components/marketing/pricing-cards";
import { FAQAccordion } from "@/components/marketing/faq-accordion";

export const metadata: Metadata = {
  title: "Pricing — ticket.app",
  description:
    "The protocol is CC0. The CLI is open source. Pay only when you want coordination.",
};

const tiers = [
  {
    name: "Free",
    price: "$0",
    features: [
      "Ticket Protocol (CC0)",
      "CLI (open source)",
      "Single-repo dashboard view",
      "Board and list views",
      "PR linking by convention",
    ],
    cta: "Install CLI",
    ctaHref: "/cli",
  },
  {
    name: "Pro",
    price: "$5 / repo / mo",
    features: [
      "Everything in Free",
      "Multi-repo dashboard",
      "Saved views and filters",
      "Faster refresh options",
      "Shareable links (read-only)",
    ],
    cta: "Start Pro",
    ctaHref: "/api/auth/github",
    highlighted: true,
  },
  {
    name: "Team",
    price: "$20 / mo",
    description: "Flat rate",
    features: [
      "Everything in Pro",
      "Unlimited repos",
      "Org portfolio view",
      "Team-friendly sharing",
      "Slack digests (when enabled)",
    ],
    cta: "Start Team",
    ctaHref: "/api/auth/github",
  },
  {
    name: "Business",
    price: "$50 / mo",
    features: [
      "Everything in Team",
      "Governance features",
      "Advanced org controls",
      "Priority support",
    ],
    cta: "Contact",
    ctaHref: "mailto:hello@ticket.app",
  },
];

const howItWorks = [
  {
    title: "You own the data",
    items: [
      "Tickets are Markdown files in your repo",
      "Git history is the audit log",
      "The dashboard reads .tickets/index.json and ticket files",
    ],
  },
  {
    title: "What happens if I cancel?",
    items: [
      "The protocol and CLI keep working",
      "Your backlog stays in Git",
      "You only lose hosted coordination features",
    ],
  },
  {
    title: "Do agents cost extra?",
    items: ["No. Agents are unlimited."],
  },
];

const faqs = [
  {
    q: "Why not per-seat pricing?",
    a: "Agent-driven teams scale identities quickly. We price coordination, not users.",
  },
  {
    q: "Is the dashboard required?",
    a: "No. It\u2019s an overlay for visibility. Git remains authoritative.",
  },
  {
    q: "Can I mix plans across repos?",
    a: "Yes. Pro is per-repo. Team is unlimited repos.",
  },
];

export default function PricingPage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-24">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Pricing that doesn&apos;t punish agents
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          The protocol is CC0. The CLI is open source. Pay only when you want
          coordination: multi-repo portfolio views, saved filters, and team
          features. No per-seat billing.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/api/auth/github"
            className="rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background transition-opacity hover:opacity-80"
          >
            Connect GitHub
          </Link>
          <Link
            href="/cli"
            className="rounded-lg border border-border px-6 py-3 text-sm font-medium transition-colors hover:bg-surface"
          >
            Install CLI
          </Link>
          <Link
            href="/protocol"
            className="text-sm font-medium text-muted underline underline-offset-4 transition-colors hover:text-foreground"
          >
            Read the Protocol
          </Link>
        </div>
        <p className="mt-4 text-xs text-subtle">
          If you stop paying, nothing breaks. Tickets still live in your repo.
        </p>
      </section>

      {/* Pricing table */}
      <section className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <PricingCards tiers={tiers} />
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-8 sm:grid-cols-3">
            {howItWorks.map((block) => (
              <div key={block.title}>
                <h3 className="font-semibold">{block.title}</h3>
                <ul className="mt-3 space-y-2">
                  {block.items.map((item) => (
                    <li key={item} className="text-sm text-muted">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-border bg-surface">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <h2 className="mb-8 text-2xl font-semibold tracking-tight sm:text-3xl">
            FAQ
          </h2>
          <FAQAccordion items={faqs} />
        </div>
      </section>

      {/* Footer CTA */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Start with the protocol. Add coordination when you need it.
          </h2>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/cli"
              className="rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background transition-opacity hover:opacity-80"
            >
              Install CLI
            </Link>
            <Link
              href="/api/auth/github"
              className="rounded-lg border border-border px-6 py-3 text-sm font-medium transition-colors hover:bg-surface-2"
            >
              Connect GitHub
            </Link>
            <Link
              href="/docs"
              className="rounded-lg border border-border px-6 py-3 text-sm font-medium transition-colors hover:bg-surface-2"
            >
              Read Docs
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
