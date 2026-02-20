# ticket.app

Git-native issue tracking for AI-first teams.

## What is this?

**ticket.app** is a protocol and toolchain for managing issues directly in your Git repository using `.tickets/` — no external service required.

## Components

| Component | Description | License |
|-----------|-------------|---------|
| [Protocol](./protocol/) | The `.tickets/` specification | CC0 (Public Domain) |
| [CLI](./apps/cli/) | `ticket` command-line tool | Apache 2.0 |
| [Core](./packages/core/) | Shared parsing/validation library | Apache 2.0 |
| Dashboard | Hosted multi-repo overlay | Proprietary (coming soon) |

## Quick Start

```bash
# Install CLI
npm i -g @ticketdotapp/cli

# Initialize in your repo
cd your-project
ticket init

# Create a ticket
ticket new "Add user authentication"

# List tickets
ticket list

# Move to in progress
ticket start TK-ABC123
```

## Protocol

The protocol spec lives in [`/protocol/PROTOCOL.md`](./protocol/PROTOCOL.md) and is released under CC0 (public domain). Anyone can implement it.

v1.1 planning and migration docs:
- [`docs/PROTOCOL-V1.1-DUAL-LANE.md`](./docs/PROTOCOL-V1.1-DUAL-LANE.md) - dual-lane model (canonical + telemetry)
- [`docs/MIGRATION-DUAL-LANE-V1.1.md`](./docs/MIGRATION-DUAL-LANE-V1.1.md) - phased migration, rollback, and verification

Key features:
- Tickets stored as Markdown files with YAML frontmatter
- Index file for fast lookups
- State machine for workflow transitions
- Actor attribution (human vs agent)

## CLI

Install: `npm i -g @ticketdotapp/cli`

Commands:
- `ticket init` — Create `.tickets/` structure
- `ticket new <title>` — Create a ticket
- `ticket list` — List tickets
- `ticket show <id>` — Show ticket details
- `ticket move <id> <state>` — Change state
- `ticket edit <id>` — Edit metadata
- `ticket validate` — Check for errors

## License

- **Protocol** (`/protocol/`): [CC0 1.0](./protocol/LICENSE) — Public domain, use freely
- **Code** (CLI, core, apps): [Apache 2.0](./LICENSE) — Open source
- **Hosted Dashboard**: Proprietary — [ticket.app](https://ticket.app)

## Links

- Website: [ticket.app](https://ticket.app)
- npm: [@ticketdotapp/cli](https://www.npmjs.com/package/@ticketdotapp/cli)
- Issues: Use `.tickets/` in this repo
