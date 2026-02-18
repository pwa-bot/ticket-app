---
id: 01KHQKCTHCSF6REBDAGMHF9W9B
title: Persist pending changes across page refresh
state: done
priority: p1
labels: []
---

## Problem

When you drag a ticket and a PR is created, the pending state indicator (Moving → Pending checks → Ready to merge) disappears on page refresh. User loses visibility into in-flight changes.

## Acceptance Criteria

- [ ] Refresh page while PR is pending → still shows pending indicator
- [ ] Pending state shows current PR status (checks running, ready to merge, merged, failed)
- [ ] Once PR is merged, pending indicator clears and ticket moves to new column
- [ ] Works across browser sessions (not just React state)

## Spec

### Approach: Query open ticket PRs on load

On board mount:
1. Query GitHub API for open PRs with branch prefix `ticket/`
2. Parse ticket ID from branch name (`ticket/{shortId}-*`)
3. Get PR status (checks, mergeable state)
4. Populate pending changes context with found PRs

### Files to modify
- `apps/web/src/components/pending-changes-context.tsx` — Add `loadPendingFromGitHub()` 
- `apps/web/src/components/board.tsx` — Call load on mount
- `apps/web/src/lib/github/get-ticket-prs.ts` — New: fetch open ticket PRs

### API needed
```typescript
GET /api/repos/:owner/:repo/ticket-prs
→ { prs: [{ ticketId, prNumber, prUrl, status }] }
```

## Notes

Alternative: localStorage + polling. But querying GitHub is more reliable (works across devices, no stale data).
