---
id: 01KHMG8CRR5CXBDBBKWBF5D2K0
title: Deterministic ordering everywhere
state: backlog
priority: p1
labels:
  - refactor
  - contract-v1
---

## Problem

List output and index.json must have stable, deterministic ordering for agent reliability and diff-friendly commits.

## Acceptance Criteria

- [ ] Implement canonical sorting for `ticket list`
- [ ] Implement canonical sorting for index.json generation
- [ ] index.json diffs stable across runs
- [ ] list output stable across runs

## Spec

Default ordering (when no `--state` filter):
1. State order: backlog, ready, in_progress, blocked, done
2. Priority: p0, p1, p2, p3
3. ID lexicographic

When `--state` filter provided:
1. Priority: p0, p1, p2, p3
2. ID lexicographic

index.json:
- `tickets[]` must be written in stable order (same sorting rules)
- JSON formatting: 2-space indentation for readability
- Consistent key ordering in objects

## Notes

This is critical for agent determinism. Same input must always produce same output.
