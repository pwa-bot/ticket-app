---
id: 01KHW6EYE44BXJKWXY17C9MSVK
title: Instrumentation MVP funnel events for CLI and dashboard activation
state: done
priority: p0
labels:
  - analytics
  - product
  - dashboard
---

## Problem

Describe the problem and context.

## Acceptance Criteria

- [x] Added web telemetry ingestion endpoint (`POST /api/telemetry`) with event allowlist and structured logging sink.
- [x] Added dashboard activation funnel events on `/space` for view, repo filtering, jump-to-ID outcomes, and ticket opens.
- [x] Added CLI activation funnel events (command started/succeeded/failed) with opt-in network sink via `TICKET_APP_TELEMETRY_URL`.

## Spec

Keep small specs inline. Link longer docs if needed.

## Notes

Any extra context, links, screenshots.
