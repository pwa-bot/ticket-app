---
id: 01KHQ0K0JMG4HGT2A78FDWJ5BX
title: Dashboard write actions via PR-based ticket changes
state: in_progress
priority: p0
labels:
  - dashboard
  - github
  - writes
  - epic
assignee: 'agent:openclaw'
reviewer: 'human:morgan'
---

## Problem

We need the dashboard to support read/write interactions (drag state, edit metadata) without breaking the core principle that Git is authoritative.

## Goal

Make the dashboard read/write without breaking the North Star:

- Git is authoritative
- Ticket Protocol remains the source of truth
- Dashboard writes happen by creating PRs that modify ticket files (and index.json)
- UI reflects changes immediately as **pending** until PR merges

This enables:

- Drag-and-drop state changes
- Inline edits (labels, assignee, reviewer, priority)
- Safe team workflows
- Agent orchestration aligned with merged truth

## Acceptance Criteria

- [ ] Dashboard supports state change and metadata edits by creating GitHub PRs that modify ticket frontmatter and index.json.
- [ ] UI shows pending state until PR merges (no optimistic canonical changes).
- [ ] PR-based changes never bypass branch protection or required reviews.
- [ ] Unknown frontmatter keys and x_ticket are preserved semantically.
- [ ] Clear error and recovery messages for missing/out-of-sync index.json.

## Spec

Full spec: [docs/DASHBOARD-WRITES-SPEC.md](../../../docs/DASHBOARD-WRITES-SPEC.md)

## Subtasks

1. **TK-01KHQ0K7** - API endpoint to create ticket-change PR (P0)
2. **TK-01KHQ0K7** - API endpoint to fetch PR status for pending changes (P1)
3. **TK-01KHQ0K7** - UI pending change model and PR status badges (P0)
4. **TK-01KHQ0K8** - Drag and drop state change creates ticket-change PR (P1)
5. **TK-01KHQ0K8** - Implement frontmatter patch algorithm with semantic preservation (P0)
6. **TK-01KHQ0K8** - Patch index.json entry and re-sort deterministically (P0)
7. **TK-01KHQ0K8** - Optional auto-merge enablement when policy allows (P2)

## Notes

All writes must be PR-based. No direct writes to default branch in v1.1.
