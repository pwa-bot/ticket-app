---
id: 01KHMG8CHHZ5875CGTFYQHD9XP
title: Formalize ticket schema parsing and rendering
state: backlog
priority: p1
labels:
  - refactor
  - contract-v1
---

## Problem

Need strict, documented parsing rules for ticket files to ensure validation catches all malformed tickets and `show --json` returns clean structured fields.

## Acceptance Criteria

- [ ] Strict `---` delimiters (exactly `---` on its own line)
- [ ] Valid YAML (no tabs)
- [ ] Required keys exist: id, title, state, priority, labels
- [ ] `id` matches filename stem exactly
- [ ] Enums valid: state in [backlog, ready, in_progress, blocked, done], priority in [p0-p3]
- [ ] `labels` always array (even if empty)
- [ ] `assignee`/`reviewer` format validated if present: `human:<slug>` or `agent:<slug>`
- [ ] `validate` catches malformed tickets with specific error messages
- [ ] `show --json` outputs frontmatter fields separately from `body_md`

## Spec

Parsing rules:
- UTF-8 only
- Frontmatter delimiter is exactly `---` on its own line
- YAML must parse cleanly, no tabs
- `state` and `priority` must be lowercase
- `id` must match filename stem exactly (case-sensitive)
- Unknown top-level keys are ignored unless under `x_ticket`

Invalid ticket handling:
- CLI `validate`: fails with exit code 7
- `show`: returns error with `validation_failed` code

## Notes

Template should omit empty assignee/reviewer lines. Only add them when `ticket assign` or `ticket reviewer` is called.
