---
id: 01KHMG8D05HYTQ1D1RYTQXYYE0
title: index.json generation and recovery
state: in_progress
priority: p1
labels:
  - refactor
  - contract-v1
---

## Problem

Need robust index.json handling: regeneration on every mutation, recovery from corruption, and validation of sync state.

## Acceptance Criteria

- [ ] Any mutation regenerates index.json and includes it in the same commit
- [ ] `rebuild-index` scans `.tickets/tickets/*.md` and regenerates
- [ ] `rebuild-index` fails with exit 7 if any ticket invalid
- [ ] `rebuild-index` commits `ticket: rebuild index` only if index changes
- [ ] `validate --fix-index` regenerates index.json if mismatch detected
- [ ] Corrupt index.json can be recovered via rebuild
- [ ] validate with fix repairs drift

## Spec

`rebuild-index` behavior:
1. Scan all `.tickets/tickets/*.md`
2. Parse frontmatter of each
3. If any invalid, exit 7 with validation errors
4. Generate index.json in deterministic order
5. If index changed, commit

`validate --fix-index` (or `--fix`):
1. Compare current index.json to regenerated version
2. If mismatch, regenerate and commit
3. Report what was fixed

Mutation commit policy:
- Every mutation includes: changed ticket file(s) + `.tickets/index.json`
- Exactly one commit per command invocation

## Notes

Map existing `--fix` to `--fix-index` for backwards compatibility.
