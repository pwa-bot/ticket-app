import Link from "next/link";
import { CodeCard } from "./code-card";

const ticketExample = `---
id: 01ARZ3NDEKTSV4RRFFQ69G5FAV
title: Add paywall experiment
state: ready
priority: p1
labels: []
---

## Problem
\u2026

## Acceptance Criteria
- [ ] \u2026`;

export function ProtocolSection() {
  return (
    <section className="border-t border-border">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid items-start gap-12 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              A simple standard any tool can implement.
            </h2>
            <p className="mt-4 text-muted">
              The Ticket Protocol is CC0. Your repo remains the source of truth.
              Any CLI, dashboard, IDE plugin, or agent can interoperate by
              reading and writing the same format.
            </p>
            <div className="mt-6 rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
              <strong className="text-foreground">Core profile:</strong> just
              ticket files.{" "}
              <strong className="text-foreground">Indexed profile:</strong> adds{" "}
              <code className="font-mono text-xs">config.yml</code> and{" "}
              <code className="font-mono text-xs">index.json</code>.
            </div>
            <div className="mt-6">
              <Link
                href="/protocol"
                className="text-sm font-medium text-brand underline underline-offset-4 hover:text-brand/80"
              >
                Read Protocol
              </Link>
            </div>
          </div>
          <CodeCard label="Example ticket">{ticketExample}</CodeCard>
        </div>
      </div>
    </section>
  );
}
