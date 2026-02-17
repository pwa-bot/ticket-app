---
id: 01KHMG868YHD8BK7DA7FGT89RB
title: Make ticket init idempotent
state: in_progress
priority: p1
labels:
  - refactor
  - contract-v1
---

## Problem

Current `ticket init` fails if `.tickets/` already exists, which breaks agent workflows that want to ensure initialization without error handling.

## Acceptance Criteria

- [ ] If `.tickets/` exists and contains required structure, exit 0 with warning
- [ ] If partial structure exists, create missing files without overwriting user edits
- [ ] Do not overwrite existing template/config unless missing
- [ ] Do not delete existing tickets
- [ ] Commit `ticket: init` only when it actually created or modified files
- [ ] Running init twice is safe
- [ ] Second run does not fail
- [ ] JSON response includes `warnings` if already initialized

## Spec

Required structure check:
- `.tickets/config.yml` exists
- `.tickets/template.md` exists
- `.tickets/index.json` exists
- `.tickets/tickets/` directory exists

If all exist → exit 0, warning "already initialized"
If some missing → create missing, commit
If none exist → full init, commit

## Notes

Agent workflow: `[ -d ".tickets" ] || ticket init` should work, but `ticket init` alone should also be safe.
