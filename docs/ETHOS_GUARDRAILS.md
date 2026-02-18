# Ticket Ethos Guardrails

Ticket is protocol-first. Git is authoritative. The hosted dashboard is an optional overlay.

This document defines non-negotiables for implementation so we do not drift into building a conventional SaaS issue tracker.

---

## Core promise

**Git is authoritative. Everything else is derived and disposable.**

- Canonical ticket state lives in `.tickets/tickets/*.md` and `.tickets/index.json`.
- The database is a derived cache for performance only.
- If the DB and Git disagree, Git wins.

---

## Non-negotiables

### 1) Git is the only canonical source of truth

- The system must be able to rebuild state by syncing from GitHub.
- Postgres must never be required for correctness.

Litmus test: **If Postgres is wiped, can we recover by re-syncing from GitHub?**

- If yes: aligned.
- If no: redesign or explicitly scope as a separate hosted product (example: future Intake).

---

### 2) Dashboard writes must be Git-native

All dashboard writes must go through GitHub:

Allowed:
- Create PRs that edit ticket files and index.json
- GitHub PR reviews, CODEOWNERS, branch protection, checks
- PR comments for agent triggers

Forbidden:
- Direct dashboard writes to canonical state in Postgres
- DB-only approvals/comments/workflows
- Direct writes to main by default

---

### 3) Pending UI must be explicit

When the dashboard creates a PR:

- Show pending state immediately with a PR link.
- Do not show canonical state as changed until the PR is merged and sync confirms it.

Pending state is UI only. Canonical state changes only when Git changes.

---

### 4) Cache must be disposable and SHA-invalidated

- Sync is SHA-based on `.tickets/index.json`.
- If index sha unchanged, do nothing.
- Fetch ticket markdown lazily on detail open.

Avoid expensive full scans via GitHub API.

---

### 5) Protocol compatibility is sacred

When rewriting ticket files:

- Preserve unknown frontmatter keys semantically
- Preserve `x_ticket` semantically
- Maintain required fields (`id`, `title`, `state`, `priority`, `labels`)
- Preserve body markdown exactly

Protocol is the interoperability contract.

---

### 6) Pricing must align with ethos

- Protocol and local tooling are free (CC0 spec, OSS CLI, OSS validator/action).
- Paid features are coordination and reliability:
  - multi-repo portfolio views
  - saved filters and sharing
  - webhooks/realtime refresh
  - Slack routing
  - governance checks
  - write convenience via PR creation
  - future intake inbox for feedback (PII handling)

We do not charge for "owning the data." Users own it in Git.

---

## Engineering review checklist

For any PR that touches dashboard, caching, sync, GitHub integration, or writes:

- Git is authoritative for canonical state
- No DB-only canonical writes
- All writes are PR-based
- Pending UI is explicit and linked to PR
- SHA-based cache invalidation
- Unknown keys and `x_ticket` preserved semantically
- Strong error codes and recovery messaging

Stop-the-line conditions:

- Canonical state changes written to Postgres without Git merge
- Dropping unknown keys or `x_ticket`
- UI showing final state before merge is confirmed
- Sync depends on DB state to be correct

---

## Practical recovery messages

When index is missing/out of sync:
- "Run `ticket rebuild-index` and push, then retry."

When GitHub rate limited:
- "Using cached data. Refresh may be delayed."

When PR conflicts:
- "Open PR to resolve conflict or retry on latest main."
