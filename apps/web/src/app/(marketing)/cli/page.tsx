import type { Metadata } from "next";
import Link from "next/link";
import { CodeCard } from "@/components/marketing/code-card";

export const metadata: Metadata = {
  title: "CLI — ticket.app",
  description:
    "A CLI designed for deterministic automation. Strict mode, structured output, and safe validation.",
};

export default function CLIPage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-24">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          A CLI designed for deterministic automation
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          Ticket is an open protocol. The CLI is the reference implementation
          for agents: strict mode, structured output, and safe validation.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="#install"
            className="rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background transition-opacity hover:opacity-80"
          >
            Install CLI
          </Link>
          <Link
            href="/protocol"
            className="rounded-lg border border-border px-6 py-3 text-sm font-medium transition-colors hover:bg-surface"
          >
            Read the Protocol
          </Link>
          <Link
            href="/docs"
            className="text-sm font-medium text-muted underline underline-offset-4 transition-colors hover:text-foreground"
          >
            CLI docs
          </Link>
        </div>
      </section>

      {/* Install */}
      <section id="install" className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="mb-4 text-xl font-semibold">Install</h2>
          <div className="max-w-md">
            <CodeCard label="npm">npm i -g @ticketdotapp/cli</CodeCard>
          </div>
        </div>
      </section>

      {/* Quick start */}
      <section className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="mb-4 text-xl font-semibold">Quick start</h2>
          <div className="max-w-lg">
            <CodeCard label="Terminal">
              {`cd your-repo
ticket init
ticket new "Add paywall experiment" --priority p1 --ci
git push`}
            </CodeCard>
          </div>
          <div className="mt-6 text-sm text-muted">
            <p className="font-medium text-foreground">Creates:</p>
            <ul className="mt-2 space-y-1">
              <li>
                <code className="font-mono text-xs">.tickets/config.yml</code>
              </li>
              <li>
                <code className="font-mono text-xs">.tickets/template.md</code>
              </li>
              <li>
                <code className="font-mono text-xs">.tickets/index.json</code>
              </li>
              <li>
                <code className="font-mono text-xs">
                  .tickets/tickets/&lt;ULID&gt;.md
                </code>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Daily commands */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="mb-4 text-xl font-semibold">
            Commands you'll use daily
          </h2>
          <div className="max-w-lg">
            <CodeCard label="Terminal">
              {`ticket list --state ready
ticket show TK-01ARZ3ND
ticket start TK-01ARZ3ND --ci
ticket done TK-01ARZ3ND --ci`}
            </CodeCard>
          </div>
        </div>
      </section>

      {/* Agent mode */}
      <section className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid items-start gap-12 lg:grid-cols-2">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Agent mode:{" "}
                <code className="font-mono text-xl">--ci</code>
              </h2>
              <p className="mt-2 text-sm font-medium text-muted">
                Strict, non-interactive execution
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted">
                <li>Exact ID matching</li>
                <li>No fuzzy selection</li>
                <li>No prompts</li>
                <li>Deterministic exit codes</li>
              </ul>
            </div>
            <CodeCard label="--ci mode">
              {`ticket list --json --ci
ticket move TK-01ARZ3ND in_progress --ci
ticket validate --json --ci`}
            </CodeCard>
          </div>
        </div>
      </section>

      {/* Structured output */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid items-start gap-12 lg:grid-cols-2">
            <CodeCard label="JSON output">
              {`ticket list --json --ci
ticket show TK-01ARZ3ND --json --ci`}
            </CodeCard>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Structured output:{" "}
                <code className="font-mono text-xl">--json</code>
              </h2>
              <p className="mt-2 text-sm font-medium text-muted">
                Never parse tables
              </p>
              <p className="mt-4 text-sm text-muted">
                Use JSON for agents and automation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Validation */}
      <section className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="mb-4 text-xl font-semibold">
            Validation and recovery
          </h2>
          <div className="max-w-lg">
            <CodeCard label="Terminal">
              {`ticket validate --all --ci
ticket rebuild-index --ci
ticket validate --all --fix-index --ci`}
            </CodeCard>
          </div>
        </div>
      </section>

      {/* PR linking */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-xl font-semibold">PR linking conventions</h2>
          <div className="mt-4 space-y-2 text-sm text-muted">
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
          <p className="mt-4 text-sm text-muted">
            The dashboard links PRs automatically when conventions match.
          </p>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Make your backlog something agents can operate reliably.
          </h2>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="#install"
              className="rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background transition-opacity hover:opacity-80"
            >
              Install CLI
            </Link>
            <Link
              href="/protocol"
              className="rounded-lg border border-border px-6 py-3 text-sm font-medium transition-colors hover:bg-surface-2"
            >
              Read the Protocol
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
