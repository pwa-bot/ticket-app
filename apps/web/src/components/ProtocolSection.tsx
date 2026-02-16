export default function ProtocolSection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16">
      <div className="grid gap-10 md:grid-cols-2 md:items-start">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Your backlog is a folder.</h2>
          <p className="mt-4 leading-relaxed text-slate-600">
            Ticket lives in your repo under <code className="rounded bg-slate-100 px-1">.tickets/</code>. Each ticket is
            a single Markdown file with YAML frontmatter. Git history is your audit log.
          </p>
          <ul className="mt-6 space-y-2 text-slate-700">
            <li>No SaaS database as the source of truth</li>
            <li>Offline by default</li>
            <li>Easy for agents to create and update deterministically</li>
          </ul>
        </div>
        <pre className="overflow-auto rounded-3xl border border-slate-200 bg-slate-950 p-5 text-xs text-slate-200">
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
    </section>
  );
}
