# ticket.app OpenClaw Skill

Git-native issue tracking. Use when creating, viewing, or managing tickets in any project.

## When to Use

- User asks to create a ticket, issue, or task
- User asks what tickets exist or what's ready to work on
- User asks to start, complete, or move a ticket
- Working in a repo that has `.tickets/` (or should have one)

## Prerequisites

- `ticket` CLI installed (clone from https://github.com/pwa-bot/ticket-app, build with `pnpm install && pnpm build`)
- For new projects: run `ticket init` first

## Commands

### Setup

```bash
ticket init                    # Create .tickets/ structure in current repo
```

### Creating Tickets

```bash
ticket new "Title"                              # Create with defaults (p2, backlog)
ticket new "Title" --priority p0                # Create with priority
ticket new "Title" --priority p1 --label bug    # With label
```

### Viewing Tickets

```bash
ticket list                           # All tickets
ticket list --state ready             # Filter by state
ticket list --state in_progress       # What's being worked on
ticket list --format kanban           # Kanban column view
ticket show <id>                      # Full ticket details
```

### Workflow

```bash
ticket start <id>                     # Move to in_progress
ticket done <id>                      # Move to done
ticket move <id> blocked              # Move to any valid state
```

### Modifying Tickets

```bash
ticket assign <id> agent:openclaw     # Set assignee
ticket reviewer <id> human:morgan     # Set reviewer
ticket edit <id> --title "New title"  # Change title
ticket edit <id> --priority p1        # Change priority
ticket edit <id> --add-label urgent   # Add label
ticket edit <id> --remove-label wip   # Remove label
```

### Git Integration

```bash
ticket branch <id>                    # Create branch tk-{short_id}-{slug}
ticket install-hooks                  # Add pre-commit validation
```

### Maintenance

```bash
ticket validate                       # Check all tickets
ticket validate --fix                 # Auto-repair index.json
ticket rebuild-index                  # Regenerate index.json
```

## Agent-Specific Guidance

### Always Use `--ci` Flag

In automation, always pass `--ci` to disable fuzzy matching:

```bash
ticket show 01JMD --ci               # Exact ID match only
ticket start 01JMDXYZ --ci           # No fuzzy resolution
```

Without `--ci`, the CLI uses fuzzy matching which can be ambiguous.

### ID Formats

- **Full ID**: `01ARZ3NDEKTSV4RRFFQ69G5FAV` (26 chars, ULID)
- **Short ID**: `01ARZ3ND` (first 8 chars)
- **Display ID**: `TK-01ARZ3ND` (prefix + short)

Use short ID or full ID in commands. Display ID is for humans.

### Auto-Commit Behavior

Every mutation (`new`, `move`, `start`, `done`, `assign`, `edit`) automatically:
1. Updates the ticket file
2. Regenerates `index.json`
3. Creates a git commit with message like `ticket: TK-01ARZ3ND → in_progress`

You don't need to commit manually.

### State Machine

```
backlog → ready → in_progress → done
            ↓         ↓
         blocked ←────┘
            ↓
    ready or in_progress
```

- `done` is terminal (no reopen in v1)
- Any state can go to `blocked`
- `blocked` can return to `ready` or `in_progress`

### Actor Format

When setting assignee/reviewer, use the format `type:slug`:
- `human:morgan` — a person
- `agent:openclaw` — an AI agent
- `agent:codex` — another AI agent

## Web Dashboard

The web dashboard at https://ticket.app is for humans. It's read-only in v1:
- Sign in with GitHub
- Pick a repo with `.tickets/`
- View kanban board
- Click tickets for detail

Agents should use the CLI, not the web.

## Example Workflow

```bash
# 1. Initialize tickets in a project
cd ~/projects/my-app
ticket init

# 2. Create a ticket
ticket new "Add user authentication" --priority p1 --label feature

# 3. Start working on it
ticket list --state ready
ticket start 01JMD... --ci

# 4. Complete it
ticket done 01JMD... --ci

# 5. Push changes
git push
```

## What This Skill Doesn't Cover

- **Policy enforcement** — v1.1 feature, not built yet
- **PR linking** — automatic via branch naming `tk-{id}-slug`
- **Web mutations** — web is read-only, use CLI
