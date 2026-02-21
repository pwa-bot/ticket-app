## Summary

What does this PR change?

## Why

Why is this needed? What problem does it solve?

## Scope

- [ ] Protocol / file format
- [ ] CLI
- [ ] Dashboard UI
- [ ] Caching / Sync
- [ ] GitHub integration (PR creation, checks, webhooks)
- [ ] Notifications (Slack, etc.)

---

# Ethos Guardrails Checklist (required)

## A) Canonical truth and data flow

- [ ] Git remains authoritative for canonical ticket state
- [ ] If DB and Git disagree, Git wins
- [ ] Feature recovers if Postgres is wiped (re-sync from GitHub works)
- [ ] UI exposes freshness (`last_synced_at`) and sync status

## B) Writes and pending behavior

- [ ] All dashboard writes are PR-based changes to ticket files (and index.json)
- [ ] No direct writes to default branch by dashboard (unless explicitly approved)
- [ ] No DB-only canonical state changes
- [ ] UI shows "pending" until PR merge is confirmed
- [ ] Pending UI always links to GitHub PR
- [ ] On merge, canonical UI state updates only after index sync

## C) Protocol compliance and forward compatibility

- [ ] Unknown frontmatter keys are preserved semantically on rewrite
- [ ] `x_ticket` is preserved semantically on rewrite
- [ ] Frontmatter delimiters remain exact `---` at file start
- [ ] Required fields preserved (`id`, `title`, `state`, `priority`, `labels`)
- [ ] State transitions validated against protocol rules before PR creation
- [ ] Labels normalized on write and deterministic in index.json

## D) Cache correctness (derived-only)

- [ ] Cache stores derived blobs only (index.json and optional ticket markdown)
- [ ] Sync invalidation is SHA-based (index.json sha)
- [ ] Sync short-circuits when index sha unchanged
- [ ] Ticket markdown fetched lazily on detail open
- [ ] Clear recovery path when index missing/out of sync (`ticket rebuild-index`)

## E) GitHub integration safety

- [ ] Tokens stored encrypted, never logged
- [ ] Repo allowlist enforced, least privilege scopes
- [ ] Webhooks (if used): signature verified, delivery deduped
- [ ] Rate-limit aware with fallback to stale cache when needed

## F) Observability and debugging

- [ ] Structured errors with stable error codes returned to UI
- [ ] Sync errors stored in repo sync status/error fields
- [ ] Clear UX for pending/failed/conflict states

## G) Product integrity

- [ ] UI never shows final state before merge confirmation
- [ ] Pending states are visually distinct and reversible

---

## Tests

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual test steps included below

## QA Signaling (required when ticket uses x_ticket.qa.required=true)

- [ ] `ticket qa ready <id> --env <value>` recorded before QA handoff
- [ ] QA handoff comment/message includes `QA READY`, ticket ID, test steps, risk callouts, and requested failure evidence
- [ ] If QA failed: `ticket qa fail <id> --reason "<reason>"` + `ticket qa reset <id>`
- [ ] If QA passed: `ticket qa pass <id> --env <value>` before `ticket done <id>`
- [ ] Ticket kept in `state: in_progress` during QA cycle until `qa_passed`

### Manual test steps

1. 
2. 
3. 

## Screenshots (if UI)

Attach before/after screenshots or a short screen recording.

## Notes

Anything reviewers should pay attention to?
