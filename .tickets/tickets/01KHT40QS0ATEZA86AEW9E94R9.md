---
id: 01KHT40QS0ATEZA86AEW9E94R9
title: Saved views and shareable filter links
state: done
priority: p0
labels:
  - dashboard
  - saved-views
assignee: agent:openclaw
reviewer: human:morgan
---

## Problem

Supervisors need one-click switching between common queries. URL params alone are not enough.

## Acceptance Criteria

- [x] View selector dropdown on portfolio and repo dashboard
- [x] Save current filters as a named view (repo-scoped by default)
- [x] Storage: localStorage for v1
- [x] "Copy link" produces shareable URL with query params
- [x] Manage views: rename, delete
- [x] Views apply consistently across board and table

## Cut

- Org-shared views (later, paid)
- Server-side saved views (later)
