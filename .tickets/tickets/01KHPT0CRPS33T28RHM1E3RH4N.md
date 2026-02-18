---
id: 01KHPT0CRPS33T28RHM1E3RH4N
title: Dogfooding feedback collection
state: ready
priority: p2
labels:
  - dogfood
  - meta
created: 2026-02-17T22:01:00.000Z
updated: 2026-02-17T22:01:00.000Z
---

## Problem

We're dogfooding ticket.app on itself. Need a place to collect feedback, friction points, and improvement ideas.

## Acceptance Criteria

- [ ] Capture feedback as it happens
- [ ] Convert high-value feedback into actionable tickets
- [ ] Review weekly and triage

## Process

**When you hit friction:**
1. Note it in `memory/2026-02-DD.md` with tag `#dogfood`
2. If it's a clear bug/improvement, create a ticket with `--label dogfood`

**Weekly review:**
1. `ticket list --json | jq '.data.tickets[] | select(.labels | contains(["dogfood"]))'`
2. Triage: fix, defer, or close

## Feedback Log

| Date | Issue | Action |
|------|-------|--------|
| 2026-02-17 | `-p` shorthand doesn't work, need `--priority` | Add to backlog |
| 2026-02-17 | `--ci` not on all commands | Check spec |

