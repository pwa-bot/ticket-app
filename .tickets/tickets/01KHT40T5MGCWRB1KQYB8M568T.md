---
id: 01KHT40T5MGCWRB1KQYB8M568T
title: Ticket templates (bug/feature/chore) for consistent creation
state: backlog
priority: p2
labels:
  - templates
  - cli
assignee: agent:openclaw
reviewer: human:morgan
---

## Problem

Tickets created by agents vary in quality. Templates standardize structure for faster review and execution.

## Acceptance Criteria

- [ ] Add templates directory: `.tickets/templates/` (optional)
- [ ] Provide built-in templates:
  - bug.md (repro, expected, actual)
  - feature.md (problem, AC, spec)
  - chore.md (scope, checklist)
- [ ] CLI supports:
  - `ticket new "Title" --template bug --ci`
- [ ] Dashboard shows template used (optional, via label or x_ticket)

## Notes

Keep templates additive. Do not expand protocol required fields.
