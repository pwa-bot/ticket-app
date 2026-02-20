---
id: 01KHVQ0B6VR7M2HAWB9QPEMBED
title: Dashboard wire All tickets view (board/table)
state: done
priority: p1
labels:
  - dashboard
  - board
  - p1
---

## Problem

The portfolio Attention cockpit is useful, but users also need a way to browse **all tickets** by state (board/table). A `board.tsx` component exists but isn’t fully wired as a mode on `/space`.

## Acceptance Criteria

- [ ] Add a mode switch on `/space`: `Attention` | `All tickets`
- [ ] Implement an index/board endpoint (suggested): `/api/space/index?repos=...`
  - Returns full ticket list for selected repos (cache-backed; no GitHub hot path)
- [ ] All tickets view supports:
  - grouped table by state OR a kanban board (start with grouped table if easier)
  - same repo selector
  - search within all tickets

## Spec

- Keep `/api/space/attention` focused on attention items + counts.
- Use index snapshots / tickets table as source for All tickets.

## Notes

Start repo-scoped if multi-repo is too heavy initially.
