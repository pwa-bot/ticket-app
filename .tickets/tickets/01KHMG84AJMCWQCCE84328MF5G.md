---
id: 01KHMG84AJMCWQCCE84328MF5G
title: Standardize error model and exit codes
state: in_progress
priority: p1
labels:
  - refactor
  - contract-v1
---

## Problem

Current CLI uses only exit codes 0 and 1, making it impossible for agents to distinguish between different failure modes without parsing stderr strings.

## Acceptance Criteria

- [ ] Add centralized error type with: `code` (string), `message`, `details` object, `exitCode` (0-8)
- [ ] Replace all `process.exit(1)` with mapped exit codes
- [ ] Every failure path exits with correct numeric code
- [ ] Error messages go to stderr in non-json mode

## Spec

Exit code mapping per contract:

| Code | Meaning |
|-----:|---------|
| 0 | Success |
| 1 | Unexpected error (I/O, parse crash, internal) |
| 2 | Usage error (bad args, invalid enum, invalid actor format) |
| 3 | Not initialized (`.tickets/` missing) |
| 4 | Not found (ticket, repo, file missing) |
| 5 | Ambiguous identifier (prefix matches multiple) |
| 6 | Invalid transition |
| 7 | Validation failed |
| 8 | Not a git repository |

Error code strings for JSON envelope:
- `not_git_repo`
- `not_initialized`
- `ticket_not_found`
- `ambiguous_id`
- `invalid_state`
- `invalid_priority`
- `invalid_transition`
- `invalid_actor`
- `validation_failed`
- `index_out_of_sync`
- `io_error`

## Notes

This is foundational - must be done before JSON envelope ticket.
