---
id: 01KHVX92DSSK48NP4HZ7H9WGQC
title: Fix O(n²) attention endpoint - use Map instead of find()
state: done
priority: p0
labels:
  - perf
---

## Problem

Describe the problem and context.

## Acceptance Criteria

- [x] Attention endpoint avoids O(n²) ticket lookup by using `Map` keyed by `repoFullName:ticketId`.

## Spec

Keep small specs inline. Link longer docs if needed.

## Notes

Any extra context, links, screenshots.
