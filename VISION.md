# VISION.md — Ticket Product Plan

## One Sentence

Ticket is the execution ledger for agent-driven work: an open Git-native protocol plus tooling that lets agents operate durable work objects and lets humans supervise delivery across many repos without seat-based costs.

---

## What We Are Building

### The Invariant We Serve

Even in a voice and chat world, teams still need:
- Canonical state
- Durable memory
- Auditability tied to code
- Governance and review routing
- A unit of delegation agents can operate deterministically

**Chat is the interface. Git is the ledger. Ticket is the protocol for the ledger.**

### The Stack

1. **Protocol (CC0)**
   - `.tickets/` layout, ticket file schema, workflow states, index.json schema, forward compatibility rules

2. **Local Tooling (OSS)**
   - CLI (agent-safe: `--ci`, JSON envelope, deterministic exit codes)
   - Validator lib
   - GitHub Action for validation

3. **Hosted Overlay (paid coordination)**
   - Multi-repo portfolio and saved views
   - PR linking and merge readiness
   - Notifications and routing

4. **Governance (paid)**
   - GitHub App check-runs that enforce policy and block merges
   - Org settings, rules, audit reporting

5. **Intake (paid future)**
   - Feedback and bug intake with PII handling
   - Dedupe and clustering
   - Promotion to Git tickets via PR

---

## What We Are NOT Building

- A Jira clone
- A kanban-first project management tool
- A Zendesk-style helpdesk as the primary product
- A SaaS database that becomes the source of truth
- Direct "write to main" edits from the dashboard

---

## Pricing Philosophy

**Free forever:**
- Protocol spec
- CLI and validator
- GitHub Action
- Single-repo read-only dashboard (optional free tier)

**Paid:**
- Multi-repo portfolio and saved views
- Shareable dashboards and team visibility
- Webhooks and realtime refresh
- Slack notifications and digests
- Governance checks via GitHub App
- Write actions that create PRs
- Intake widget and triage inbox

**Principle:** Free for local-first and standards. Paid for coordination, governance, and operational reliability.

---

## What "All Types of Tickets" Means

We should say "all types of work items agents can execute," not "everything people call a ticket."

**In-scope long term:**
- Engineering tickets (bugs, features, chores)
- Ops work tied to code (incidents, postmortems)
- Agent run artifacts (task runs, checklists, execution logs)
- Product tasks that map to repos

**Out of scope as primary:**
- Support inbox tickets with PII and threaded conversations
- HR/finance/legal workflows

We can still route customer feedback into engineering tickets through an intake layer, but the canonical ticket remains Git-native and sanitized.

---

## The Dashboard for 3 Humans, 20 Projects, 5 Machines

This should feel like a **supervisory control plane**, not a board.

### Dashboard Home: "Attention"

A high-density table across repos with the rows you actually need:

**Columns:**
- Ticket (display id), Title
- Repo (owner/repo)
- State, Priority
- Assignee, Reviewer
- Linked PR count + primary PR
- CI status (pass/fail/running/unknown)
- Review required (who)
- Age in state
- Last activity (agent/human + time)

**Row actions:**
- Open ticket (modal)
- Open PR
- Copy link
- Request changes (creates a PR comment or task for agent)
- Approve (if GitHub review integration)
- Merge (if policy allows and checks are green)
- Reassign reviewer/assignee (writes ticket via PR or creates an "assignment PR")

**Key default views:**
- Needs review now
- Mergeable now
- Blocked
- Aging and stuck
- P0 only
- By repo

This lets 3 humans supervise 20 repos quickly.

### Ticket Detail

- Rendered markdown
- Linked PRs and CI status
- Reviewer required and current approvals
- Activity timeline (derived)
- Quick actions: open PR, comment command to agent, copy branch name

### Notifications (Slack First)

Mobile apps are not needed initially. Slack covers the urgent loop:
- "Ticket ready for review"
- "Mergeable now"
- "P0 failing checks"
- Daily digest by repo or portfolio view

---

## Write Capabilities: Only PR-Based

To preserve the North Star, all write actions in the hosted overlay should be:
- Create a PR that edits ticket files, or
- Comment on PRs and trigger agents, or
- Toggle GitHub auto-merge and merge when policy allows

**Do not mutate ticket files directly on main from the dashboard.**

This keeps Git authoritative and reviewable.

---

## Rules and Governance

Rules should be simple and enforced via GitHub checks, not a parallel workflow engine.

**Examples:**
- P0 requires Mathieu approval
- Auto-merge allowed for P3 chores if checks pass
- Block merge if ticket invalid per protocol
- Block merge if PR does not reference a ticket id

**Implementation:**
- GitHub App check-run reads PR diff, validates `.tickets/` changes, and emits annotations.

---

## Phased Roadmap

### Phase 1: Protocol and CLI (OSS)
- Protocol draft v1.0.0 published
- CLI contract implemented: exit codes, JSON envelope, `--ci`, validate, rebuild-index
- GitHub Action validator

**Success metric:** Agents can create, move, validate, and link PRs reliably without a UI.

### Phase 2: Read-Only Dashboard (free or low tier)
- GitHub OAuth
- Multi-repo read-only portfolio
- Board/list views
- Ticket modal deep links
- PR linking and basic CI status

**Success metric:** Humans can supervise across many repos in one screen.

### Phase 3: Paid Coordination
- Saved views and sharing
- Slack digests and notifications
- Faster refresh via webhooks
- Merge readiness signals

**Success metric:** Teams pay because it's not worth building and maintaining themselves.

### Phase 4: Governance Checks (paid)
- GitHub App installation
- Check-runs that enforce protocol and basic policy
- Org settings

**Success metric:** Teams pay for guardrails and reduced risk.

### Phase 5: Intake (paid future)
- Feedback widget and triage inbox hosted
- Dedupe and clustering
- Promotion to Git tickets via PR with sanitized summary

**Success metric:** Ticket becomes the router from real-world signals into durable work objects.

---

## What to Refuse Until Pulled by Users

- Native iOS/Android apps (Slack first)
- Custom workflows beyond the simple 5-state model
- Threaded comments inside Ticket separate from GitHub
- Anything that makes the hosted app the source of truth
