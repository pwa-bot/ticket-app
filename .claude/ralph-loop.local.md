---
active: true
iteration: 1
max_iterations: 30
completion_promise: null
started_at: "2026-02-19T05:17:21Z"
---

Build the Multi-repo Portfolio Attention View (TK-01KHT40Q).

## Spec
Route: /space (portfolio home)
- Shows enabled repos selector and global search
- Default saved view: Attention
- Attention includes rows where any are true:
  - pending ticket-change PR exists
  - PR waiting review (linked PR exists, approvals missing)
  - CI failing on linked PR
  - ticket state is blocked
  - ticket in_progress is stale (>24h)
- Each row shows: display id, title, repo, state, priority, PR status, CI status, assignee, reviewer, age in state
- Row actions: open ticket modal, open PR, copy ticket link
- Loads from Postgres cache only (zero GitHub API calls on request path)

## Cut
- No write actions from portfolio in first iteration

## Existing Patterns
- Check apps/web/src/app/space/[owner]/[repo]/ for repo board patterns
- Check apps/web/src/db/schema.ts for tickets, prCache, prChecksCache tables
- API routes in apps/web/src/app/api/

## When done
Run tests with pnpm test. Output <promise>DONE</promise> when tests pass.

When completely finished, run: openclaw system event --text 'Done: Portfolio Attention view (TK-01KHT40Q) complete' --mode now
