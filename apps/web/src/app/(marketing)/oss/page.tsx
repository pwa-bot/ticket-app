import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Open Source — ticket.app",
  description:
    "Ticket is open where it should be: protocol and tooling. Your data stays in your repo.",
};

export default function OSSPage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-24">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Open Source
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          Ticket is open where it should be: protocol and tooling. Your data
          stays in your repo.
        </p>
      </section>

      {/* What's open */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Protocol-first.
          </h2>
          <ul className="mt-6 space-y-2">
            {[
              "Ticket Protocol is CC0",
              "CLI is open source",
              "Docs and examples are open",
            ].map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-sm text-muted"
              >
                <span className="mt-0.5 text-success">&check;</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* What's paid */}
      <section className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Pay for coordination.
          </h2>
          <p className="mt-4 text-muted">
            Ticket.app is a hosted overlay for:
          </p>
          <ul className="mt-4 space-y-2">
            {[
              "Multi-repo portfolio views",
              "Saved filters and sharing",
              "Faster refresh",
              "Team coordination integrations",
            ].map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-sm text-muted"
              >
                <span className="mt-0.5 text-subtle">&bull;</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Compatibility promise */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Protocol stability matters.
          </h2>
          <p className="mt-4 max-w-2xl text-muted">
            The protocol is the interoperability contract. Implementations
            evolve, but the spec is the shared substrate.
          </p>
        </div>
      </section>

      {/* Contributing */}
      <section className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Contributing
          </h2>
          <ul className="mt-6 space-y-3 text-sm text-muted">
            <li>
              <Link
                href="https://github.com/nickarilla/ticket-app"
                className="text-brand underline underline-offset-4 hover:text-brand/80"
              >
                GitHub repositories
              </Link>
            </li>
            <li>
              <Link
                href="https://github.com/nickarilla/ticket-app/issues"
                className="text-brand underline underline-offset-4 hover:text-brand/80"
              >
                Issues and discussions
              </Link>
            </li>
          </ul>
          <p className="mt-4 text-sm text-muted">
            Guidelines: keep the protocol small. Additive changes preferred.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="https://github.com/nickarilla/ticket-app"
              className="rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background transition-opacity hover:opacity-80"
            >
              GitHub repositories
            </Link>
            <Link
              href="/protocol"
              className="rounded-lg border border-border px-6 py-3 text-sm font-medium transition-colors hover:bg-surface"
            >
              Read the protocol
            </Link>
            <Link
              href="/cli"
              className="rounded-lg border border-border px-6 py-3 text-sm font-medium transition-colors hover:bg-surface"
            >
              Install CLI
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
