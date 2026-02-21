# ticket.app OpenClaw Skill v2.2

Git-native issue tracking. **No code change without a ticket.**

## Overview

Ticket is the durable execution ledger for agent work:
- Tickets live in Git under `.tickets/`
- Agents operate tickets via the `ticket` CLI
- Humans view the dashboard overlay at https://ticket.app

---

## Installation

```bash
npm i -g @ticketdotapp/cli
```

---

## Repo Prerequisites

**Check these before any ticket operation.**

### 1. Must be a git repo
```bash
git rev-parse --git-dir
```

### 2. `.tickets/` must exist
If missing, initialize and commit:
```bash
ticket init
git push
```

### 3. Index must be healthy
If broken:
```bash
ticket rebuild-index
```

---

## Golden Rules

1. **Always use `--ci`** for automation (exact ID matching)
2. **Always use `--json`** when parsing output
3. **Never create duplicates** without checking existing tickets first
4. **Never skip states** to complete work
5. **Always validate before pushing**
6. **CLI commits automatically** — do not manually commit ticket changes
7. **Use QA contract for handoff** — see `docs/QA-HANDOFF-CONTRACT.md`

---

## State Machine

```
backlog → ready → in_progress → done
   ↓        ↓         ↓    ↑
   └──→ blocked ←─────┘    │
            ↓              │
    ready or in_progress ──┘
```

**Valid transitions:**
- `backlog` → `ready`, `blocked`
- `ready` → `in_progress`, `blocked`
- `in_progress` → `done`, `ready`, `blocked`
- `blocked` → `ready`, `in_progress`

**Invalid:**
- `ready` → `done` (must go through `in_progress`)
- `done` → anything (terminal)

---

## Standard Workflow

### A) Before Starting Work

1. **List what's ready:**
   ```bash
   ticket list --state ready --json --ci
   ```

2. **If using an existing ticket, start it:**
   ```bash
   ticket start <id> --ci
   ```

3. **If new work, check for duplicates first:**
   ```bash
   ticket list --json --ci
   ```
   Scan for similar titles/labels. Use existing ticket if found.

4. **Create only if none exists:**
   ```bash
   ticket new "Title" -p p1 --label feature --ci
   ticket start <id> --ci
   ```

5. **If sub-agent will work on it, push immediately:**
   ```bash
   git push
   ```

### B) After Completing Work

1. **For QA-required tickets, perform QA handoff first:**
   - Fill the `## QA` section in the ticket body.
   - Set `x_ticket.qa.required: true` and move QA status to `ready_for_qa`.
   - Post handoff message with marker `QA READY`, ticket ID, exact steps, and risk callouts.

2. **Mark done** (only after QA pass when `x_ticket.qa.required: true`):
   ```bash
   ticket done <id> --ci
   ```

3. **Validate protocol state:**
   ```bash
   ticket validate --json --ci
   ```

4. **Push:**
   ```bash
   git push
   ```

### C) QA Result Handling (required when QA is requested)

1. **If QA fails:**
   - Mark QA status `qa_failed` with a concise reason.
   - Keep ticket in `in_progress`.
   - Implement fix, then return to `ready_for_qa`.

2. **If QA passes:**
   - Mark QA status `qa_passed`.
   - Then move ticket to `done`.

---

## Blocked Work

When progress is blocked:

```bash
ticket move <id> blocked --ci
ticket edit <id> --labels +needs-input --ci
```

Add explanation in ticket body under `## Notes`:
- What is blocked
- What is needed to unblock
- Who is needed (if applicable)

Then validate and push:
```bash
ticket validate --json --ci
git push
```

When unblocked:
```bash
ticket move <id> in_progress --ci
ticket edit <id> --labels -needs-input --ci
ticket validate --json --ci
git push
```

**Do not oscillate states.** If stuck, go to `blocked` once and document why.

---

## Ticket Quality

**Only start tickets in `ready` state.** Tickets in `backlog` may not be specced.

Before moving to `ready`, ensure ticket has:
- **Problem** — What's broken or missing
- **Acceptance Criteria** — How to verify it's done

Optional:
- Spec or design notes
- Links to related tickets

---

## Assignment & Review

### Assign implementation ownership
```bash
ticket assign <id> agent:openclaw --ci
```

### Set a reviewer
```bash
ticket reviewer <id> human:morgan --ci
```

Note: These are metadata. Enforcement is via GitHub (CODEOWNERS, branch protection).

---

## Git Conventions

### Branch naming
```bash
ticket branch <id> --ci
```
Convention: `tk-<short_id>-<slug>`

Example: `tk-01arz3nd-add-authentication`

### PR title (required)
**Must include ticket ID in brackets:**
```
[TK-01ARZ3ND] Add authentication
```

### When to push
Push after meaningful state changes:
- After `ticket start` (if sub-agent needs it)
- After `ticket done`
- After `ticket move blocked`

---

## Sub-Agent Strategy

### Before Spawning

1. Ensure `.tickets/` exists (run `ticket init` if not)
2. Start the ticket and push:
   ```bash
   ticket start <id> --ci
   git push
   ```
3. Optionally assign:
   ```bash
   ticket assign <id> agent:<name> --ci
   git push
   ```

### Spawn Prompt Template

Use this format:

> Work on **[TK-01ARZ3ND]**: Add authentication.
>
> 1. Pull latest main
> 2. Create branch `tk-01arz3nd-add-authentication`
> 3. Implement changes and run tests
> 4. When complete:
>    - `ticket done 01ARZ3ND... --ci`
>    - `ticket validate --json --ci`
>    - `git push`

### Model Selection

| Task Type | Model Tier | Examples |
|-----------|------------|----------|
| Backend implementation | Strong coding | Codex CLI, Claude Code |
| Frontend/UI | Strong coding | Claude Code |
| Quick fixes | Current session | Don't spawn |
| Architecture | Strongest | Opus-tier |
| Monitoring, validation | Cheap/fast | Flash, Haiku-tier |

**Cost guidance:**
- P0/P1: Worth stronger models
- P2/P3: Use cheaper models or batch
- Routine work: Never use expensive models

### After Spawning

Monitor and confirm completion:
```bash
ticket show <id> --json --ci
```

---

## Heartbeat Hygiene

When idle or on heartbeat:

1. **List in-progress:**
   ```bash
   ticket list --state in_progress --json --ci
   ```

2. **For stale tickets** (>24h no commits):
   - Complete them, or
   - Move to `blocked` with explanation

3. **Validate:**
   ```bash
   ticket validate --json --ci
   ```

---

## Anti-Patterns

❌ "Quick fix" without a ticket
❌ Creating without checking for duplicates
❌ Skipping `in_progress` (going `ready` → `done`)
❌ Leaving tickets in `in_progress` indefinitely
❌ Forgetting to push
❌ Using fuzzy matching in automation (always `--ci`)
❌ Bouncing states repeatedly (use `blocked` instead)
❌ Pushing without validating

---

## Command Reference

### Setup
```bash
ticket init
ticket rebuild-index
```

### Core
```bash
ticket new "Title" -p p1 --label x --ci
ticket list --json --ci
ticket list --state ready --json --ci
ticket show <id> --json --ci
ticket start <id> --ci
ticket done <id> --ci
ticket move <id> blocked --ci
ticket validate --json --ci
```

### QA (contract-defined behavior)
```bash
ticket qa ready <id> --env <local|staging|prod>
ticket qa fail <id> --reason "<reason>"
ticket qa pass <id> --env <local|staging|prod>
```

### Metadata
```bash
ticket edit <id> --labels +foo --ci
ticket edit <id> --labels -foo --ci
ticket assign <id> agent:openclaw --ci
ticket reviewer <id> human:morgan --ci
```

### Git helpers
```bash
ticket branch <id> --ci
```

---

## AGENTS.md Snippet

Add to your project:

```markdown
## Ticket Discipline (required)

No code change without a ticket.

### Before starting any work
1) List ready tickets:
   - `ticket list --state ready --json --ci`
2) If using an existing ticket:
   - `ticket start <id> --ci`
3) If the work is new:
   - Check for duplicates first:
     - `ticket list --json --ci`
   - Then create:
     - `ticket new "Title" -p p1 --label <label> --ci`
   - Start it:
     - `ticket start <id> --ci`

If a sub-agent will work on it, push so they can pull:
- `git push`

### After completing work
1) Mark done:
   - `ticket done <id> --ci`
2) Validate:
   - `ticket validate --json --ci`
3) Push:
   - `git push`

### Blocked work
- `ticket move <id> blocked --ci`
- `ticket edit <id> --labels +needs-input --ci`

Add a brief explanation under `## Notes` in the ticket file, then:
- `ticket validate --json --ci`
- `git push`

### Rules
- Always use `--ci` in automation.
- Always use `--json` when parsing output.
- PR title must include `[TK-<short_id>]`.
- Branch must follow `tk-<short_id>-<slug>` (use `ticket branch <id> --ci`).
```

---

## Appendix: Sub-Agent Prompt Templates

### A) Routine Implementation

```text
Ticket: [TK-<SHORT_ID>] <TITLE>
Repo: <OWNER>/<REPO>

Rules:
- Pull latest main
- Use canonical branch: tk-<short_id>-<slug> (run: ticket branch <SHORT_ID> --ci)
- No fuzzy matching, always use --ci
- Do the work, run tests, then:
  - ticket done <SHORT_ID> --ci
  - ticket validate --json --ci
  - git push

PR:
- Title must start with: [TK-<SHORT_ID>] <TITLE>

Task:
<WHAT TO DO>

Reply with:
- Summary of changes
- Tests run
- Confirm ticket done + pushed
- PR link (if created)
```

### B) Review-Only (No Code Changes)

```text
Review-only for Ticket: [TK-<SHORT_ID>] <TITLE>
Repo: <OWNER>/<REPO>
PR: <PR URL>

Rules:
- Do NOT make code changes unless explicitly asked
- Do NOT mark ticket done
- Leave feedback as PR review comments, and summarize in a single final message

Focus:
- Does implementation match ticket Acceptance Criteria?
- Any edge cases missing?
- Test coverage and failure modes?
- Naming, architecture, and risk assessment
- Anything that could break in production

Reply with:
- 3–8 concrete review comments (grouped by severity)
- Suggested fixes
- "Merge readiness" verdict: merge / merge with nits / changes requested
```

### C) Fix-Only (Address Review Comments)

```text
Fix-only pass for Ticket: [TK-<SHORT_ID>] <TITLE>
Repo: <OWNER>/<REPO>
PR: <PR URL>

Rules:
- Only address existing review comments and failing checks.
- No scope expansion. If you think something else should change, leave a note instead of doing it.
- No fuzzy matching. Always use --ci and the ticket short id.
- Keep changes minimal and targeted.
- Run the project's standard tests for the affected area.

Steps:
1) Pull latest main and update the PR branch.
2) Read all PR comments and checks.
3) Implement fixes strictly required to resolve:
   - Requested changes
   - CI failures
   - Lint/type failures
4) Push updates.
5) Comment on the PR summarizing what you fixed and what remains.

If and only if all requested changes are resolved and checks are green:
- ticket done <SHORT_ID> --ci
- ticket validate --json --ci
- git push

PR requirements:
- Keep PR title: [TK-<SHORT_ID>] <TITLE>
- Do not create a new PR.

Reply with:
- List of comments addressed (bullet list)
- Tests run and results
- Link to the updated PR
- Whether the ticket was marked done (only if truly complete)
```
