---
id: 01KHW6EY6MS5WYZFZA3Y3ZCC8R
title: Attention index tuning with explain analyze baselines
state: in_progress
priority: p1
labels:
  - data
  - perf
  - indexing
---

## Problem

Describe the problem and context.

## Acceptance Criteria

- [x] Baseline `EXPLAIN ANALYZE` captured for current attention query shapes
- [x] Attention endpoint query path optimized to prefilter candidate tickets at DB layer
- [x] New index migration added for attention predicates (`repos`, `tickets`, `ticket_prs`, `pending_changes`)
- [x] Repeatable perf baseline script added (`apps/web/scripts/attention-perf-baseline.ts`)
- [x] Perf plan parser + tests added for validation (`src/lib/perf/explain-plan.ts`)
- [x] Web tests and typecheck pass after changes

## Spec

Keep small specs inline. Link longer docs if needed.

## Notes

- Baselines documented in `docs/ATTENTION-PERF-BASELINES.md`.
