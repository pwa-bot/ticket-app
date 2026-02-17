---
id: 01KHMG85TGQZ1TDCBJ6JDYA10V
title: Implement JSON envelope (--json flag)
state: backlog
priority: p1
labels:
  - refactor
  - contract-v1
---

## Problem

Agents cannot reliably parse CLI output. Need structured JSON responses with consistent envelope format.

## Acceptance Criteria

- [ ] Add global `--json` flag
- [ ] For `list`, `show`, `validate`, return exactly one JSON object to stdout
- [ ] Success: `{ "ok": true, "data": {...}, "warnings": [] }`
- [ ] Failure: `{ "ok": false, "error": { "code": "...", "message": "...", "details": {} }, "warnings": [] }`
- [ ] In `--ci --json`, always emit envelope even on errors
- [ ] No mixed logs in stdout when `--json` is set
- [ ] Agents can parse stdout reliably

## Spec

JSON must be exactly one object, no streaming, no partial output.

Commands requiring `--json` support:
- `ticket list --json`
- `ticket show --json`
- `ticket validate --json`

`show --json` data structure:
```json
{
  "id": "01JMDXYZABCDEFGHJKLMNPQRST",
  "short_id": "01JMDXYZ",
  "display_id": "TK-01JMDXYZ",
  "title": "...",
  "state": "ready",
  "priority": "p1",
  "labels": [],
  "assignee": null,
  "reviewer": null,
  "body_md": "## Problem\n...",
  "path": ".tickets/tickets/..."
}
```

`list --json` data structure:
```json
{
  "tickets": [...],
  "count": 1
}
```

## Notes

Depends on: TK-01KHMG84 (exit codes)
