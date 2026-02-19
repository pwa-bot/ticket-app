---
id: 01KHT40QGXG6EWEA41J6ZJEVTC
title: Multi-repo portfolio view with Attention default
state: backlog
priority: p0
labels:
  - portfolio
  - dashboard
assignee: agent:openclaw
reviewer: human:morgan
---

## Problem

App studios need to supervise many repos without switching contexts. The default question is: what needs human attention right now?

## Scope

Portfolio home that aggregates across enabled repos and surfaces a prioritized attention queue. Table-first.

## Acceptance Criteria

- [ ] Route: /space (portfolio home)
- [ ] Shows enabled repos selector and global search
- [ ] Default saved view: Attention
- [ ] Attention includes rows where any are true:
  - pending ticket-change PR exists
  - PR waiting review (linked PR exists, approvals missing)
  - CI failing on linked PR
  - ticket state is blocked
  - ticket in_progress is stale (configurable threshold, default 24h)
- [ ] Each row shows:
  - display id, title, repo, state, priority
  - PR status + CI status + merge readiness
  - assignee, reviewer
  - age in state, updated
- [ ] Row actions:
  - open ticket modal
  - open PR
  - copy ticket link
- [ ] Loads with zero GitHub API calls on request path (Postgres cache only)

## Cut

- No write actions from portfolio in first iteration (can add later)
