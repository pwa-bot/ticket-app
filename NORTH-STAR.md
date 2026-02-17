# ticket.app North Star

## What we are building

**Ticket is the execution ledger for agent-driven software.**

It is a Git-native protocol and tooling that turns ephemeral intent (chat, voice, agent runs) into durable, auditable work objects tied to code, tests, and releases.

## What we are not building

* A kanban product
* A Jira clone
* A project management suite
* A UI-first workflow tool
* A per-seat SaaS that becomes the source of truth

---

## The invariant we serve

Even in a voice and chat future, teams still need:

* **Canonical state** (what is true now)
* **Durable memory** (what happened and why)
* **Auditability** (who did what)
* **Governance** (what must be reviewed)
* **Delegation units** (objects agents can safely operate)

Chat is not a system of record. Agent memory is not a system of record. **Git is.**

Ticket rides on that.

---

## Product thesis

**Protocols beat products in agent-native worlds.**

Agents need deterministic formats and validation more than they need UI. Humans need visibility and governance without replatforming work into a SaaS database.

Ticket wins by being:

* repo-native
* machine-operable
* UI-agnostic
* optional-overlay, not lock-in

---

## Core promises (must always remain true)

### 1) Repo is the source of truth

* Tickets live as Markdown files under `.tickets/`
* State is in YAML frontmatter
* History is git history
* The hosted dashboard is an overlay, never canonical

### 2) Agent-safe determinism

* CLI supports `--ci` mode
* Strict parsing, strict exit codes
* Machine-readable JSON output
* No hidden side effects beyond explicit commits

### 3) Governance uses Git primitives

* Approvals are GitHub PR reviews, CODEOWNERS, branch protection, checks
* Ticket does not invent a parallel approval database
* Enforcement, when added, blocks merges via checks, not by mutating truth elsewhere

### 4) No per-seat trap

* Agents are unlimited
* Pricing is based on coordination value (multi-repo, portfolio, checks, notifications), not user count

### 5) UI is a convenience layer

* Web views are for scanning, triage, linking PRs, portfolio visibility
* Humans should be able to operate via chat/voice agents that use Ticket under the hood

---

## Success metric (simple)

A new orchestrator can be pointed at a repo and reliably:

* create a ticket
* move it through states
* open a PR linked by convention
* pass validation
* leave a durable trail in Git

Humans can:

* understand what's happening in under 30 seconds
* click from ticket to PR
* see what's blocked and what shipped

---

## Design principles (how we make decisions)

### Build what increases reliability and reversibility

* strict formats
* deterministic validation
* rebuild and recovery tools
* minimal moving parts

### Refuse features that centralize truth in SaaS

If a feature requires:

* a server-side canonical task database
* a proprietary workflow language that diverges from Git
* per-seat billing to work

We do not build it.

### Prefer conventions over configuration

* simple workflow v1 is hardcoded
* conventions for branch and PR titles
* minimal config files

Add configuration only when users pull for it.

### Prefer PR-based writes over direct writes

If web needs to "edit," it should create a PR that updates ticket files.

---

## The minimal moat

* A clean protocol that agents can operate
* Deterministic CLI contract
* Index strategy (`index.json`) that makes overlays fast
* Governance integration via Git checks
* Cross-repo portfolio visibility as the paid layer

---

## Expansion that fits the North Star

These are allowed because they keep Git canonical:

1. **Multi-repo portfolio overlay**
   Derived views across repos. No new truth.

2. **Policy checks**
   GitHub check-run that validates `.tickets/` rules and blocks merges.

3. **Chat and voice interfaces**
   Slack, CLI, and later voice are just frontends that call the protocol.

4. **Customer feedback intake**
   Hosted intake stores raw input and PII. Promotion creates a repo ticket via PR with a sanitized summary.

---

## Expansion that does not fit

* Full-blown helpdesk support system
* Internal comments and threads that never make it into Git
* Custom workflows that turn Ticket into Jira
* Any feature that breaks offline-first or makes the hosted layer required

---

## One sentence that should guide everything

**Ticket is Git-native memory for agent execution.**
