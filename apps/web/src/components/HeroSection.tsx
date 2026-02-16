import Link from "next/link";

const worksWith = ["OpenClaw", "Claude Code", "GitHub Actions", "any orchestrator"];

export default function HeroSection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-20 md:py-24">
      <div className="grid gap-10 md:grid-cols-2 md:items-center">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">
            Git-native issue tracking for AI-first teams
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-600">
            Tickets are Markdown in your repo. Agents use the CLI. Humans use a clean dashboard. No seats. No agent
            accounts.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/cli" className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-medium text-white">
              Install CLI
            </Link>
            <Link
              href="/dashboard"
              className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-medium text-slate-900"
            >
              Connect GitHub
            </Link>
          </div>
          <p className="mt-4 text-sm text-slate-500">CLI is free and open source. Dashboard reads from your repo.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {worksWith.map((item) => (
              <span key={item} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700">
                {item}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <p className="text-xs font-medium text-slate-500">`.tickets/tickets/01ARZ3NDEKTSV4RRFFQ69G5FAV.md`</p>
          <pre className="mt-3 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-200">
            <code>{`---
id: 01ARZ3NDEKTSV4RRFFQ69G5FAV
title: Add paywall experiment
state: ready
priority: p1
labels: []
---

## Problem
...

## Acceptance Criteria
- [ ] ...`}</code>
          </pre>
        </div>
      </div>
    </section>
  );
}
