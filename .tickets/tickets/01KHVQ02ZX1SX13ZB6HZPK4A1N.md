---
id: 01KHVQ02ZX1SX13ZB6HZPK4A1N
title: Dashboard add totals and repo counts to attention endpoint; fix empty states
state: backlog
priority: p0
labels:
  - dashboard
  - api
  - attention
  - p0
---

## Problem

The `/space` Attention page feels broken because:
1) `/api/space/attention` returns **only attention items**, so the UI can’t distinguish:
   - no tickets exist
   - tickets exist but none need attention
   - filters/search hide results
2) The UI renders **two empty states at once**: `AttentionTable` shows “No tickets found” for empty rows while the parent also shows “All clear!”.

## Acceptance Criteria

- [ ] Update `AttentionResponse` to include totals:
  - `totals.reposEnabled`, `totals.reposSelected`, `totals.ticketsTotal`, `totals.ticketsAttention`
- [ ] Include per-repo counts in `repos[]` returned by `/api/space/attention`:
  - `totalTickets`, `attentionTickets`
  - Compute from existing `tickets` + `items` in the handler (no extra DB calls required).
- [ ] Update `PortfolioAttentionView` empty-state logic to show exactly one of:
  - no repos enabled
  - no tickets at all
  - all clear (ticketsTotal > 0 && ticketsAttention === 0)
  - no results (attention exists but filters/search hide)
- [ ] Eliminate double-empty-state rendering (parent owns empties).

## Spec

### API changes (minimal)
- In `/api/space/attention/route.ts`, build:
  - `totalByRepo` while iterating `tickets`
  - `attentionByRepo` while building `items`
- Return:
  - `repos: enabledRepos.map(r => ({...r, totalTickets, attentionTickets }))`
  - `totals: { ... }`

### UI changes
- Do **not** render `AttentionTable` when there are no rows.
- Remove/disable any internal empty-state message inside `AttentionTable`.

## Notes

This is the missing piece that makes the portfolio cockpit feel consistent and makes search/empties non-confusing.
