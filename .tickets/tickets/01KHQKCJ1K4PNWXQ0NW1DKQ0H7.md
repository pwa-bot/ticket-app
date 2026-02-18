---
id: 01KHQKCJ1K4PNWXQ0NW1DKQ0H7
title: Auto-merge PRs for ticket state changes
state: backlog
priority: p1
labels: []
---

## Problem

When dragging tickets between columns, a PR is created but requires manual merge. This adds unnecessary friction for simple state transitions.

## Acceptance Criteria

- [ ] After drag-drop, PR is created AND auto-merged (if checks pass)
- [ ] User sees "Moving..." → "Done" (not "Ready to merge")
- [ ] Fallback to manual merge if auto-merge fails (conflicts, checks fail)
- [ ] Board refreshes automatically after merge

## Spec

### Approach
After PR creation in `createTicketChangePr()`, immediately attempt to merge:

1. Create PR (existing code)
2. Wait briefly for any required status checks
3. Call `octokit.rest.pulls.merge()` with `merge_method: "squash"`
4. If merge fails (conflicts, checks), fall back to current behavior (manual merge)
5. Return `status: "merged"` or `status: "pending_merge"` in response

### Files to modify
- `apps/web/src/lib/github/create-ticket-change-pr.ts` — Add merge step
- `apps/web/src/components/pending-changes-context.tsx` — Handle "merged" status
- `apps/web/src/components/board.tsx` — Refresh board on merge

## Notes

Use `merge_method: "squash"` to keep history clean. Single commit per state change.
