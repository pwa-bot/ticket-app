# ticket.app OpenClaw Skill

Git-native issue tracking for AI-first teams.

## Installation

```bash
npm i -g @ticketdotapp/cli
```

---

## Core Principle

> **No code change without a ticket.**

This applies to you AND any sub-agents you spawn.

---

## Before Starting Any Work

1. Check what's ready:
   ```bash
   ticket list --state ready --json --ci
   ```

2. If using an existing ticket:
   ```bash
   ticket start <id> --ci
   ```

3. If new work:
   - **Search first** (avoid duplicates):
     ```bash
     ticket list --json --ci
     ```
   - Check for similar titles/labels before creating
   - Then create and start:
     ```bash
     ticket new "Title" -p p1 --label feature --ci
     ticket start <id> --ci
     ```

4. If a sub-agent needs the ticket, push:
   ```bash
   git push
   ```

---

## After Completing Work

1. Ensure tests pass (project standard)
2. Complete the ticket:
   ```bash
   ticket done <id> --ci
   ```
3. Validate protocol state:
   ```bash
   ticket validate --json --ci
   ```
4. Push:
   ```bash
   git push
   ```

**Never push broken protocol state.**

---

## Handling Blocked Work

```bash
ticket move <id> blocked --ci
ticket edit <id> --labels +needs-input --ci
```

Add explanation in the ticket body (edit the .md file), then push:
```bash
git push
```

When unblocked:
```bash
ticket move <id> in_progress --ci
```

---

## State Machine

```
backlog → ready → in_progress → done
            ↓         ↓
         blocked ←────┘
            ↓
    ready or in_progress
```

**Rules:**
- `ready → in_progress → done` is the only path to completion
- `ready → done` is **invalid** (must go through `in_progress`)
- `blocked → done` is **invalid** (must return to `in_progress` first)
- `done` is terminal (no reopen)

**Do not bounce states repeatedly.** If stuck, set to `blocked` and document why.

---

## Ticket Quality

**Only start tickets in `ready` state.** Tickets in `backlog` may not be fully specced.

Before moving a ticket to `ready`, ensure it has:
- **Problem** — What's broken or missing
- **Acceptance Criteria** — How to verify it's done

Optional but helpful:
- Spec or design notes
- Links to related tickets

---

## Git Conventions

### Auto-Commit

Every ticket mutation auto-commits:
```
ticket: TK-01ARZ3ND → in_progress
ticket: TK-01ARZ3ND → done
```

### Branch Naming

```bash
ticket branch <id>    # Creates: tk-01arz3nd-add-authentication
```

**Branch MUST include** `tk-<shortid>-`

### PR Title

**PR title MUST contain** `[TK-<shortid>]` prefix:
```
[TK-01ARZ3ND] Add user authentication
```

### When to Push

Push after any meaningful state change:
- After `ticket start` (if sub-agent needs to see it)
- After `ticket done`
- After `ticket move blocked`

---

## Sub-Agent Strategy

### Before Spawning

If `.tickets/` does not exist:
```bash
ticket init
git add .tickets
git commit -m "chore: initialize ticket tracking"
git push
```

### Model Selection

| Task Type | Model Tier | Examples |
|-----------|------------|----------|
| Implementation (backend) | Strong coding model | Codex CLI, Claude Code |
| Implementation (frontend) | Strong coding model | Claude Code |
| Quick fixes | Current session | Don't spawn |
| Architecture decisions | Strongest available | Opus-tier |
| Monitoring, validation | Cheap/fast model | Flash, Haiku-tier |

**Cost guidance:**
- P0/P1 tickets: Worth stronger models
- P2/P3 tickets: Use cheaper models or batch
- Never use expensive models for routine work

### Spawning Pattern

1. Create or identify the ticket
2. Start it: `ticket start <id> --ci`
3. Push: `git push`
4. Spawn with ticket context:
   ```
   "Work on [TK-01KHMG85]: <description>.
   When complete:
   1. Run tests
   2. ticket done 01KHMG85... --ci
   3. ticket validate --json --ci
   4. git push"
   ```
5. Monitor for completion

---

## Commands Reference

### Always Use `--ci` and `--json`

In automation, **always** use:
- `--ci` — Exact ID matching (no fuzzy)
- `--json` — Machine-readable output

```bash
ticket list --json --ci
ticket show <id> --json --ci
ticket validate --json --ci
```

### Essential Commands

```bash
ticket init                           # Setup .tickets/
ticket new "Title" -p p1 --ci         # Create ticket
ticket list --state ready --json --ci # See ready work
ticket start <id> --ci                # Begin work
ticket done <id> --ci                 # Complete work
ticket show <id> --json --ci          # Full details
ticket validate --json --ci           # Check for errors
```

### ID Formats

- **Full ID**: `01ARZ3NDEKTSV4RRFFQ69G5FAV` (26 chars)
- **Short ID**: `01ARZ3ND` (8 chars) — use in commands
- **Display ID**: `TK-01ARZ3ND` — for PR titles, humans

---

## Anti-Patterns

❌ **Don't skip ticket creation for code changes**
> "I'll just fix this quick..." → Untracked work

❌ **Don't create duplicates**
> Search first with `ticket list --json --ci`

❌ **Don't skip states**
> `ready → done` is invalid; must go through `in_progress`

❌ **Don't leave tickets in `in_progress` forever**
> Complete them or move to `blocked` with explanation

❌ **Don't forget to push**
> Dashboard and sub-agents can't see unpushed changes

❌ **Don't oscillate states**
> If stuck, go to `blocked` once and document why

❌ **Don't use fuzzy matching in automation**
> Always use `--ci` flag

❌ **Don't push broken protocol state**
> Run `ticket validate --json --ci` before push

---

## Heartbeat Integration

Add to HEARTBEAT.md:

```markdown
## Ticket Hygiene

On heartbeat, if no urgent work:
1. `ticket list --state in_progress --json --ci`
2. Check for stale tickets (>24h with no commits)
3. Either complete them or move to `blocked`
4. `ticket validate --json --ci`
```

---

## Web Dashboard

https://ticket.app — Read-only view for humans

- Sign in with GitHub
- Select repos with `.tickets/`
- Kanban board
- Ticket detail

**Agents use CLI, not web.**

---

## AGENTS.md Snippet

Add to your project:

```markdown
## Ticket Discipline

**No code change without a ticket.**

Before starting:
1. `ticket list --state ready --json --ci`
2. Existing ticket: `ticket start <id> --ci`
3. New work: search first, then `ticket new` + `ticket start`

After completing:
1. Tests pass
2. `ticket done <id> --ci`
3. `ticket validate --json --ci`
4. `git push`

PR title: `[TK-<id>] <title>`
Branch: `tk-<id>-<slug>`
```
