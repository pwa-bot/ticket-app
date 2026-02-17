import type { Metadata } from "next";
import Link from "next/link";
import { CodeCard } from "@/components/marketing/code-card";

export const metadata: Metadata = {
  title: "Ticket Protocol — ticket.app",
  description:
    "The open standard for machine-readable work stored in Git. CC0 licensed.",
};

const ticketExample = `---
id: 01ARZ3NDEKTSV4RRFFQ69G5FAV
title: Example ticket
state: ready
priority: p1
labels: []
---

Markdown body\u2026`;

const indexExample = `{
  "format_version": 1,
  "generated_at": "2026-02-16T18:22:11Z",
  "workflow": "simple-v1",
  "tickets": [
    {
      "id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      "short_id": "01ARZ3ND",
      "display_id": "TK-01ARZ3ND",
      "title": "Example ticket",
      "state": "ready",
      "priority": "p1",
      "labels": [],
      "path": ".tickets/tickets/01ARZ3NDEKTSV4RRFFQ69G5FAV.md"
    }
  ]
}`;

export default function ProtocolPage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-24">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Ticket Protocol
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          The open standard for machine-readable work stored in Git. CC0
          licensed.
        </p>
      </section>

      {/* What it defines */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            A format, not a product.
          </h2>
          <p className="mt-4 max-w-2xl text-muted">
            The protocol defines repository layout, ticket file format, workflow
            states, and the index schema. Any implementation can read and write
            tickets that conform.
          </p>
          <div className="mt-10 grid gap-8 sm:grid-cols-2">
            <div>
              <h3 className="font-semibold">Includes</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-success">&check;</span>
                  <code className="font-mono text-xs">.tickets/</code>{" "}
                  repository structure
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-success">&check;</span>
                  Ticket file format (YAML frontmatter + Markdown body)
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-success">&check;</span>
                  Five-state workflow and transitions
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-success">&check;</span>
                  <code className="font-mono text-xs">index.json</code> schema
                  for efficient querying
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-success">&check;</span>
                  Forward compatibility rules (
                  <code className="font-mono text-xs">x_ticket</code> namespace)
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold">Does not include</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-subtle">&mdash;</span>
                  CLI commands
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-subtle">&mdash;</span>
                  Dashboard UI
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-subtle">&mdash;</span>
                  Pricing or business model
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-subtle">&mdash;</span>
                  GitHub-specific features
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Conformance profiles */}
      <section className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Core and Indexed
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 sm:max-w-2xl">
            <div className="rounded-lg border border-border bg-white p-6">
              <h3 className="font-semibold">Core profile</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted">
                <li>
                  Only requires{" "}
                  <code className="font-mono text-xs">
                    .tickets/tickets/*.md
                  </code>
                </li>
                <li>Ideal for minimal tooling or manual workflows</li>
              </ul>
            </div>
            <div className="rounded-lg border border-brand bg-white p-6">
              <h3 className="font-semibold">Indexed profile</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted">
                <li>
                  Adds{" "}
                  <code className="font-mono text-xs">
                    .tickets/config.yml
                  </code>{" "}
                  and{" "}
                  <code className="font-mono text-xs">
                    .tickets/index.json
                  </code>
                </li>
                <li>Enables fast dashboards and large-scale querying</li>
              </ul>
            </div>
          </div>
          <p className="mt-4 text-sm text-subtle">
            ticket.app requires Indexed profile.
          </p>
        </div>
      </section>

      {/* Canonical examples */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="mb-8 text-2xl font-semibold tracking-tight sm:text-3xl">
            Canonical examples
          </h2>
          <div className="grid gap-8 lg:grid-cols-2">
            <CodeCard label="Ticket file">{ticketExample}</CodeCard>
            <CodeCard label="index.json">{indexExample}</CodeCard>
          </div>
        </div>
      </section>

      {/* Principle */}
      <section className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Git is authoritative.
          </h2>
          <p className="mt-4 max-w-2xl text-muted">
            Any caches, databases, or indexes are derived and disposable. If
            there is a conflict, ticket files win.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="https://github.com/nickarilla/ticket-app/blob/main/PROTOCOL.md"
              className="rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background transition-opacity hover:opacity-80"
            >
              View PROTOCOL.md
            </Link>
            <Link
              href="/cli"
              className="rounded-lg border border-border px-6 py-3 text-sm font-medium transition-colors hover:bg-surface"
            >
              Install CLI
            </Link>
            <Link
              href="/api/auth/github"
              className="rounded-lg border border-border px-6 py-3 text-sm font-medium transition-colors hover:bg-surface"
            >
              Connect GitHub
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
