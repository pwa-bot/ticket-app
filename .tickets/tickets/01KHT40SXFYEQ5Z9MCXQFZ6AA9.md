---
id: 01KHT40SXFYEQ5Z9MCXQFZ6AA9
title: Slack integration v1 (digest + deep links + review reminders)
state: done
priority: p1
labels:
  - slack
  - notifications
assignee: 'agent:openclaw'
reviewer: 'human:morgan'
---

## Problem

Teams live in Slack. Ticket should route attention where humans are.

## Scope (v1)

Notifications and digests. No full ticket CRUD from Slack in v1.

## Acceptance Criteria

- [ ] Connect Slack workspace + choose channel per repo or portfolio
- [ ] Daily digest:
  - mergeable now
  - waiting review
  - failing checks
  - blocked
- [ ] Review reminder ping:
  - if reviewer set and PR waiting review > X hours
- [ ] Messages include:
  - ticket deep link
  - PR link
  - status summary
- [ ] Rate limit to avoid spam

## Cut (later)

- Create tickets from Slack
- Interactive state changes from Slack
