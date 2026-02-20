import type { Metadata } from "next";
import Link from "next/link";
import { FAQAccordion } from "@/components/marketing/faq-accordion";

export const metadata: Metadata = {
  title: "Dashboard — ticket.app",
  description:
    "A fast overlay on top of the Ticket Protocol. Reads from Git. No separate database.",
};

const faqs = [
  {
    q: "Do I need the dashboard to use Ticket?",
    a: "No. The protocol and CLI work without any hosted service.",
  },
  {
    q: "What happens if I stop paying?",
    a: "Nothing breaks. Your tickets remain in Git. You just lose hosted coordination features.",
  },
  {
    q: "Why not just use GitHub Issues?",
    a: "Ticket is a protocol: specs in Markdown, deterministic CLI for agents, and a fast derived index for overlays.",
  },
];

export default function DashboardPage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-24">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          A dashboard that reads from Git
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          Ticket.app is a fast overlay on top of the Ticket Protocol. It reads{" "}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-sm">
            .tickets/index.json
          </code>{" "}
          and ticket files from your repo. Git stays authoritative.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/api/auth/github"
            className="rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background transition-opacity hover:opacity-80"
          >
            Connect GitHub
          </Link>
          <Link
            href="/pricing"
            className="rounded-lg border border-border px-6 py-3 text-sm font-medium transition-colors hover:bg-surface"
          >
            View pricing
          </Link>
        </div>
        <p className="mt-4 text-xs text-subtle">
          Read-only in v1. Edit via CLI and git.
        </p>
      </section>

      {/* How to connect */}
      <section className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Three steps to get started
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-3 sm:max-w-3xl">
            <div className="rounded-lg border border-border bg-white p-6">
              <span className="text-sm font-medium text-brand">1</span>
              <h3 className="mt-2 font-semibold">Connect GitHub</h3>
              <p className="mt-2 text-sm text-muted">
                Sign in with GitHub OAuth. No write access required.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-white p-6">
              <span className="text-sm font-medium text-brand">2</span>
              <h3 className="mt-2 font-semibold">Select repos</h3>
              <p className="mt-2 text-sm text-muted">
                Choose which repos to display. Only repos with{" "}
                <code className="font-mono text-xs">.tickets/</code> are shown.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-white p-6">
              <span className="text-sm font-medium text-brand">3</span>
              <h3 className="mt-2 font-semibold">
                Reads{" "}
                <code className="font-mono text-xs">.tickets/index.json</code>
              </h3>
              <p className="mt-2 text-sm text-muted">
                The dashboard loads the CLI-generated index for fast rendering.
                Git stays authoritative.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* What the dashboard is */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Visibility without moving your workflow into SaaS
          </h2>
          <p className="mt-4 max-w-2xl text-muted">
            The dashboard does not replace your repo. It renders what&apos;s
            already there: ticket files and a derived index for speed.
          </p>
          <ul className="mt-6 space-y-2">
            {[
              "Dashboard views across tickets",
              "Filters by state, priority, labels, repo",
              "Ticket detail view renders Markdown cleanly",
              "Deep links are shareable and bookmarkable",
            ].map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-sm text-muted"
              >
                <span className="mt-0.5 text-success">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Two files power the UI
          </h2>
          <p className="mt-4 max-w-2xl text-muted">
            Ticket.app uses the Indexed Profile of the protocol.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-muted list-none">
            <li>
              <span className="font-medium text-foreground">1.</span> Tickets
              live as Markdown files:{" "}
              <code className="font-mono text-xs">
                .tickets/tickets/&lt;ULID&gt;.md
              </code>
            </li>
            <li>
              <span className="font-medium text-foreground">2.</span> The CLI
              generates a derived index:{" "}
              <code className="font-mono text-xs">.tickets/index.json</code>
            </li>
          </ul>
          <p className="mt-6 font-medium">
            Result: Fast loading without a canonical database.
          </p>
          <p className="mt-2 text-sm text-subtle">
            If index.json is stale, ticket files are authoritative.
          </p>
        </div>
      </section>

      {/* PR linking */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Link work to code by convention
          </h2>
          <p className="mt-4 max-w-2xl text-muted">
            If your branch and PR title follow the convention, the dashboard
            links them automatically.
          </p>
          <div className="mt-6 space-y-2 text-sm text-muted">
            <p>
              <strong className="text-foreground">Branch:</strong>{" "}
              <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">
                {"tk-{short_id}-{slug}"}
              </code>
            </p>
            <p>
              <strong className="text-foreground">PR title:</strong>{" "}
              <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">
                {"[TK-{short_id}] {title}"}
              </code>
            </p>
          </div>
          <div className="mt-6 text-sm text-muted">
            <p className="font-medium text-foreground">What you see:</p>
            <ul className="mt-2 space-y-1">
              <li>Linked PRs on ticket detail</li>
              <li>CI status (if available)</li>
              <li>Last updated signals</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Multi-repo portfolio */}
      <section className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            See work across all repos
          </h2>
          <p className="mt-4 max-w-2xl text-muted">
            Upgrade for portfolio views across multiple repos, saved filters, and
            shareable dashboards.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3 sm:max-w-2xl">
            {[
              "All ready tickets across repos",
              "Everything blocked",
              "P0 and P1 in flight",
            ].map((example) => (
              <div
                key={example}
                className="rounded-lg border border-border bg-white px-4 py-3 text-sm text-muted"
              >
                &quot;{example}&quot;
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Read-only by default
          </h2>
          <p className="mt-4 max-w-2xl text-muted">
            In v1, Ticket.app does not write to your repo. It reads selected
            repos via GitHub OAuth and respects GitHub permissions.
          </p>
          <ul className="mt-6 space-y-2">
            {[
              "Repo allowlist (only repos you select)",
              "Tokens stored securely",
              "Webhooks optional later for faster refresh",
            ].map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-sm text-muted"
              >
                <span className="mt-0.5 text-success">✓</span>
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-6">
            <Link
              href="/security"
              className="text-sm font-medium text-brand underline underline-offset-4 hover:text-brand/80"
            >
              Read Security
            </Link>
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
            Add visibility when you want it. Keep Git as the source of truth.
          </h2>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/api/auth/github"
              className="rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background transition-opacity hover:opacity-80"
            >
              Connect GitHub
            </Link>
            <Link
              href="/pricing"
              className="rounded-lg border border-border px-6 py-3 text-sm font-medium transition-colors hover:bg-surface-2"
            >
              View pricing
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
