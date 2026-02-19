---
id: 01KHVQ07RFJNSWWTGRF9EG0NDB
title: Dashboard fix Attention search and add Jump-to-ID
state: backlog
priority: p0
labels:
  - dashboard
  - search
  - attention
  - p0
---

## Problem

On `/space` (Attention mode), search feels broken because it only filters the attention list, which is often empty. There’s also no direct “jump to ticket by ID” flow.

## Acceptance Criteria

- [ ] Search filters *attention items* by:
  - displayId (e.g. `TK-01KHM550`)
  - shortId
  - title
  - repoFullName
  - labels
  - (optional) assignee/reviewer
- [ ] If `totals.ticketsAttention === 0`, disable search input (or show helper text) with link/CTA to “All tickets”.
- [ ] Add Jump-to-ID input:
  - Accept `TK-...` and shortId forms
  - Opens ticket detail modal directly when found

## Spec

- Implement filtering client-side over loaded attention rows.
- Jump-to-ID can use the loaded data first; if not found, show “Not found in current repos” + CTA to switch to All tickets.

## Notes

This should remove the “search box that does nothing” vibe when the portfolio is actually all-clear.
