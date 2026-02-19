# Ticket.app Studio Coordination Backlog

This backlog is ordered by dependencies and "studio value per week."

Legend:
- P0: must ship for studio-grade usefulness
- P1: high leverage next
- P2: nice to have

---

## Phase 0: Foundations (blocking for everything else)

### P0: GitHub App + Webhooks + Derived Cache

Goal: eliminate rate limits and make dashboard fast.
Dependency for: portfolio, merge readiness, Slack.

Acceptance:
- UI board/table read from Postgres cache
- push/pull_request/check_run webhooks populate cache
- manual refresh triggers async sync

**Status: COMPLETE ✅**
- ✅ GitHub App installed on pwa-bot org
- ✅ Webhook handlers: push, pull_request, check_run, installation
- ✅ DB schema: prCache, prChecksCache, tickets, repoSyncState
- ✅ Installation token flow (`getInstallationOctokit`)
- ✅ Push handler fetches and syncs index.json (commit 8306aa3)

---

## Phase 1: P0 "Control Plane" MVP (studio-grade)

### P0: Multi-repo Portfolio "Attention" view

Depends on: Derived Cache.
Delivers: single supervisor screen.

Includes:
- cross-repo table
- attention signals (pending PRs, waiting review, failing CI, blocked, stale in_progress)
- open ticket + open PR actions
- filter/search

### P0: Saved views and filters

Depends on: Portfolio.
Delivers: fast switching for humans.

Includes:
- save view to localStorage
- shareable URLs
- view selector

### P0: Merge readiness signal

Depends on: PR cache + checks cache (from webhooks).
Delivers: "what is safe to merge" in one badge.

Includes:
- Mergeable now / Waiting review / Failing checks / Conflict / Unknown

### P0: PR-based writes from dashboard (if any direct writes remain)

Depends on: GitHub integration to create PRs.
Delivers: write UX without breaking "Git is authoritative."

Includes:
- drag or dropdown creates ticket-change PR
- pending badge until merge
- prevent multiple pending state change PRs per ticket
- retry on conflict/failure

**Status: COMPLETE** — `create-ticket-change-pr.ts` implemented.

---

## Phase 1.5: Governance (moved up — this is the differentiator)

### P0: Minimal GitHub Check-run (protocol integrity)

Depends on: GitHub App + basic webhook infra.
Delivers: governance with Git primitives. **The "teeth."**

Includes (v1 minimal):
- validate Ticket Protocol on PRs touching .tickets/
- schema validation (frontmatter, id matches filename)
- hard fail with annotations on violations

Excludes (Phase 2 expansion):
- transition validation
- custom policy rules
- opt-in gates

---

## Phase 2: P1 high leverage

### P1: Expand check-run into policy (opt-in gates)

Depends on: Minimal check-run working.
Delivers: "P0 requires reviewer", custom rules.

### P1: Slack integration v1 (attention routing only)

Depends on: Portfolio + merge readiness.
Delivers: attention routing to where humans are.

Includes:
- daily digest for "Attention"
- reviewer reminders
- "mergeable now" alerts
- deep links to ticket + PR

Excludes (keeps scope tight):
- ticket CRUD from Slack
- interactive state changes

---

## Phase 3: P2 polish

### P2: Ticket templates (bug/feature/chore)

Depends on: CLI.
Delivers: higher quality tickets from agents and humans.

Includes:
- templates directory
- `ticket new --template`
- consistent sections

---

## Dependencies Map

```
Portfolio ─────────► Derived Cache (webhooks)
Merge Readiness ───► PR cache + checks cache
Slack Digest ──────► Portfolio + Merge Readiness
Policy Checks ─────► GitHub App + check-run impl
PR-based Writes ───► GitHub App (DONE ✅)
```

## Recommended Sequencing

1. ✅ PR-based writes (complete)
2. ✅ Derived Cache + webhook sync (complete)
3. Minimal GitHub check-run (protocol integrity) ← **NEXT**
4. Portfolio Attention view
5. Merge readiness badge
6. Saved views
7. Expand check-run into policy (opt-in gates)
8. Slack digest + reminders (attention routing only)
9. Templates

*Rationale: Checks are the "teeth" — the differentiator that makes ticket.app a protocol with enforcement, not just files + dashboard. Moving them earlier strengthens positioning.*
