# ticket.app - Claude Code Context

## What We're Building

A Git-native issue tracking CLI that stores tickets as markdown files.

## Key Files

- `SPEC.md` — Complete v1.0.1 specification (READ THIS FIRST)
- `.tickets/config.yml` — Configuration
- `.tickets/template.md` — Template for new tickets
- `.tickets/index.json` — Generated index (CLI must update this)
- `.tickets/tickets/` — Where ticket files live

## Tech Stack

- TypeScript
- Node.js CLI (Commander.js)
- simple-git for auto-commits
- ulid for ID generation
- gray-matter for frontmatter parsing
- Vitest for testing

## CLI Build Order

1. `ticket init` — Create .tickets/ structure
2. `ticket new "Title"` — Create ticket with ULID, write file, update index.json, auto-commit
3. `ticket list` — Read from index.json, display tickets
4. `ticket show <id>` — Display ticket details
5. `ticket move <id> <state>` — Validate transition, update file, update index.json, auto-commit
6. `ticket start <id>` — Shortcut for move to in_progress
7. `ticket done <id>` — Shortcut for move to done
8. `ticket validate` — Validate ticket frontmatter
9. `ticket rebuild-index` — Regenerate index.json from all ticket files

## Important Rules

1. **Always update index.json** after any mutation
2. **Auto-commit** after mutations with format: `ticket: TK-XXXXXXXX → state`
3. **ULID IDs** — 26 chars uppercase, display as TK-{first 8 chars}
4. **Deterministic index sorting** — state order, then priority, then id
5. **Strict frontmatter** — id, title, state, priority required; labels optional

## Workflow States

`backlog` → `ready` → `in_progress` → `done`

Also: `any` → `blocked`, `blocked` → `ready` or `in_progress`

`done` is terminal.

## Project Structure

```
ticket-app/
  src/
    cli.ts          # Main CLI entry
    commands/       # Command implementations
    lib/
      ticket.ts     # Ticket file operations
      index.ts      # index.json operations
      git.ts        # Git operations
      ulid.ts       # ID generation
  package.json
  tsconfig.json
```

## Testing

Use Vitest. Test:
- Frontmatter parsing
- State transitions (valid and invalid)
- Index.json generation
- ULID generation
