# ticket.app OpenClaw Skill (v2 Draft)

Git-native issue tracking. **All work should be tracked as tickets.**

## Installation

```bash
npm i -g @ticketdotapp/cli
```

## Core Principle

> **No work without a ticket.**

Before starting any task:
1. Check if a ticket exists (`ticket list`)
2. If not, create one (`ticket new "..."`)
3. Start the ticket (`ticket start <id> --ci`)
4. Do the work
5. Complete the ticket (`ticket done <id> --ci`)
6. Push to GitHub (`git push`)

This applies to YOU (the agent) and any sub-agents you spawn.

---

## AGENTS.md Integration

Add this to your project's AGENTS.md or CLAUDE.md:

```markdown
## Ticket Discipline

**Before starting any task:**
1. Run `ticket list --state ready` to see what's queued
2. If working on an existing ticket, run `ticket start <id> --ci`
3. If this is new work, run `ticket new "Title" --priority p1` first

**After completing any task:**
1. Run `ticket done <id> --ci`
2. Commit any remaining changes
3. Run `git push`

**State machine:**
- backlog → ready → in_progress → done
- Never skip states (ready→done is invalid)
- Use `ticket start` then `ticket done`

**All mutations auto-commit.** Don't manually commit ticket changes.
```

---

## Sub-Agent Strategy

When spawning sub-agents for ticket work:

### Model Selection by Task Type

| Task Type | Recommended Model | Reason |
|-----------|-------------------|--------|
| Implementation (backend) | `gpt-5.3-codex` via Codex CLI | Strong at code, covered by subscription |
| Implementation (frontend) | Claude Code (Sonnet) | Better at React/UI patterns |
| Quick fixes, small edits | Current session | Don't spawn, do it yourself |
| Architecture decisions | Opus | Worth the cost for hard problems |
| Code review, validation | Flash/Haiku | Cheap, good enough for checks |

### Spawning Pattern

```markdown
When spawning a sub-agent for a ticket:

1. Create or identify the ticket first
2. Move it to in_progress
3. Include ticket ID in the task prompt:
   "Work on TK-01KHMG85: [description]. When complete, run `ticket done 01KHMG85... --ci` and push."
4. Monitor for completion (session-monitor cron or manual check)
5. Verify ticket state changed to done
```

### Cost Tracking

- **P0/P1 tickets**: Worth using stronger models
- **P2/P3 tickets**: Use cheaper models or batch with other work
- **Monitoring/maintenance**: Use Flash (cheap) or Haiku
- **Never use Opus for routine ticket work** — reserve for architecture

---

## Commands Reference

### Essential Commands

```bash
ticket init                           # Setup .tickets/ in a repo
ticket new "Title" -p p1              # Create ticket (auto-commits)
ticket list                           # See all tickets
ticket list --state ready             # What's ready to work on
ticket start <id> --ci                # Move to in_progress (exact match)
ticket done <id> --ci                 # Move to done (exact match)
ticket show <id>                      # Full ticket details
```

### Always Use `--ci` Flag

In automation, **always** pass `--ci`:
- Disables fuzzy matching (prevents wrong ticket)
- Uses exact ID matching only
- Safe for scripts and agents

### ID Formats

- **Full ID**: `01ARZ3NDEKTSV4RRFFQ69G5FAV` (26 chars)
- **Short ID**: `01ARZ3ND` (8 chars) — use in commands
- **Display ID**: `TK-01ARZ3ND` — for humans

---

## State Machine

```
backlog → ready → in_progress → done
            ↓         ↓
         blocked ←────┘
            ↓
    ready or in_progress
```

**Valid transitions:**
- `backlog` → `ready`
- `ready` → `in_progress`, `blocked`
- `in_progress` → `done`, `blocked`
- `blocked` → `ready`, `in_progress`

**Invalid:**
- `ready` → `done` (must go through `in_progress`)
- `done` → anything (terminal state)

---

## GitHub Integration

### Auto-Commit

Every ticket mutation creates a git commit:
```
ticket: TK-01ARZ3ND → in_progress
ticket: TK-01ARZ3ND → done
```

### Branch Naming

```bash
ticket branch <id>    # Creates: tk-01arz3nd-add-authentication
```

PR titles should reference ticket: `TK-01ARZ3ND Add user authentication`

### Push After Work

**Always push after completing tickets:**
```bash
ticket done <id> --ci
git push
```

The web dashboard reads from GitHub. Unpushed changes won't appear.

---

## Workflow Examples

### Starting a New Feature

```bash
# Check what's ready
ticket list --state ready

# Nothing suitable? Create one
ticket new "Add user authentication" -p p1 --label feature

# Start it
ticket start 01JMD... --ci

# Work on it...
# (make changes, tests, etc.)

# Complete it
ticket done 01JMD... --ci
git push
```

### Spawning a Sub-Agent

```bash
# Create ticket first (if doesn't exist)
ticket new "Refactor payment module" -p p2

# Start it
ticket start 01JMD... --ci
git push  # So sub-agent sees it

# Spawn with ticket context
sessions_spawn(
  task="Work on TK-01JMD...: Refactor payment module per SPEC.md. Run ticket done 01JMD... --ci when complete.",
  model="gpt-5.3-codex"
)

# Monitor via session-monitor or manual check
```

### Handling Blocked Work

```bash
# Something's blocking progress
ticket move <id> blocked --ci

# Add note about why (edit the .md file or use edit command)
ticket edit <id> --add-label needs-input

# When unblocked
ticket move <id> in_progress --ci
```

---

## Anti-Patterns

❌ **Don't skip ticket creation**
> "I'll just fix this quick..." → Creates untracked work

❌ **Don't forget to start tickets**
> Going straight to `done` is invalid

❌ **Don't leave tickets in `in_progress` forever**
> Complete them or move to `blocked`

❌ **Don't forget to push**
> Web dashboard won't see unpushed changes

❌ **Don't use fuzzy matching in automation**
> Always use `--ci` flag

---

## Web Dashboard

https://ticket.app — Read-only view for humans

- Sign in with GitHub
- Pick repos with `.tickets/`
- Kanban board view
- Ticket detail modal

**Agents use CLI, not web.**

---

## Heartbeat Integration

Add to HEARTBEAT.md:

```markdown
## Ticket Hygiene Check

On heartbeat, if no urgent work:
1. Run `ticket list --state in_progress`
2. Check for stale tickets (in_progress >24h with no commits)
3. Either complete them or move to blocked
4. Run `ticket validate` to check for errors
```

---

## Summary

| Action | Command |
|--------|---------|
| Setup | `ticket init` |
| Create | `ticket new "Title" -p p1` |
| List ready | `ticket list --state ready` |
| Start work | `ticket start <id> --ci` |
| Complete | `ticket done <id> --ci` |
| Push | `git push` |
| Validate | `ticket validate` |
