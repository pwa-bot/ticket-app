# ticket.app - Claude Code Context

## What We're Building

A Git-native issue tracking system with:
1. **CLI** (`apps/cli`) — TypeScript CLI for ticket management
2. **Web** (`apps/web`) — Next.js dashboard for visual board view
3. **Core** (`packages/core`) — Shared types and utilities

## Monorepo Structure (Turborepo + pnpm)

```
ticket-app/
├── apps/
│   ├── cli/          # TypeScript CLI
│   │   ├── src/
│   │   │   ├── cli.ts
│   │   │   ├── commands/
│   │   │   └── lib/
│   │   └── package.json
│   └── web/          # Next.js dashboard
│       ├── src/app/
│       └── package.json
├── packages/
│   └── core/         # Shared types
│       └── src/index.ts
├── .tickets/         # Our own tickets (dogfooding)
├── SPEC.md           # Complete specification
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

## Key Files

- `SPEC.md` — Complete v1.0.1 specification (READ THIS FIRST)
- `packages/core/src/index.ts` — Shared types (Ticket, TicketState, etc.)
- `.tickets/config.yml` — Configuration
- `.tickets/index.json` — Generated index for web to read

## Commands

```bash
pnpm turbo build      # Build all packages
pnpm turbo dev        # Dev mode
pnpm turbo test       # Run all tests
```

## CLI Tech Stack

- TypeScript + Commander.js
- simple-git for auto-commits
- ulid for ID generation
- gray-matter for frontmatter
- Vitest for testing

## Web Tech Stack

- Next.js 16 (App Router)
- Tailwind CSS
- GitHub OAuth for repo access
- Reads index.json from GitHub API

## CLI Status

✅ Implemented: init, new, list, show, move, start, done, assign, reviewer, rebuild-index
⏳ Remaining: edit, validate, policy, branch, install-hooks

## Web Status

⏳ Not started — needs:
1. GitHub OAuth flow (/api/auth/github)
2. Repo picker (list user's repos with .tickets/)
3. Kanban board (fetch index.json, render columns)
4. Ticket detail modal (fetch individual .md file)

## Important Rules

1. **Always update index.json** after CLI mutations
2. **Auto-commit** after mutations: `ticket: TK-XXXXXXXX → state`
3. **ULID IDs** — 26 chars uppercase, display as TK-{first 8 chars}
4. **Types from core** — Import from `@ticket-app/core`
5. **Web is read-only** — No write operations in v1

## Workflow States

`backlog` → `ready` → `in_progress` → `done`

Also: `any` → `blocked`, `blocked` → `ready` or `in_progress`

`done` is terminal.
