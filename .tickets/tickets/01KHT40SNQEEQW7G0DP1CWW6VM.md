---
id: 01KHT40SNQEEQW7G0DP1CWW6VM
title: GitHub check-run policy enforcement for Ticket Protocol
state: in_progress
priority: p0
labels:
  - governance
  - github-app
  - checks
assignee: 'agent:openclaw'
reviewer: 'human:morgan'
updated: '2026-02-19T05:09:33.549Z'
---

## Problem

We need real governance using Git primitives: block merges if ticket rules are violated.

## Scope

GitHub App check-run that validates Ticket Protocol invariants on PRs touching `.tickets/`.

## Acceptance Criteria

- [ ] Check triggers on PR events when files under `.tickets/` change
- [ ] Validates:
  - ticket frontmatter schema
  - id matches filename
  - valid states/priorities/labels
  - x_ticket preserved (no dropping unknown keys)
  - index.json matches ticket changes (basic consistency)
- [ ] For ticket-change PRs, validate transition allowed per repo workflow config
- [ ] Emits annotations with actionable messages
- [ ] Fails check to block merge when violations exist

## Cut

- Full enterprise policy language (later)
- Custom workflows beyond preset/overrides (later)
