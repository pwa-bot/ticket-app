---
id: 01KHS9PFF2Z37S54PZD6QGW8DJ
title: Task G - Manual refresh endpoint and job
state: done
priority: p2
labels:
  - refresh
  - api
---

## Problem

Describe the problem and context.

## Acceptance Criteria

- [x] Manual refresh endpoint enqueues a background refresh job instead of blocking on sync.
- [x] Background worker route processes queued refresh jobs with retry/failure handling.
- [x] Board/API integration triggers refresh queueing from the existing refresh flow.
- [x] Automated tests cover enqueue, dedupe, success, retry, and permanent failure paths.

## Spec

Keep small specs inline. Link longer docs if needed.

## Notes

Any extra context, links, screenshots.
