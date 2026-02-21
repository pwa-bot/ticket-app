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
ticket start TK-01ARZ3ND
```

## Protocol

The protocol spec lives in [`/protocol/PROTOCOL.md`](./protocol/PROTOCOL.md) and is released under CC0 (public domain). Anyone can implement it.

v1.1 planning and migration docs:
- [`docs/PROTOCOL-V1.1-DUAL-LANE.md`](./docs/PROTOCOL-V1.1-DUAL-LANE.md) - dual-lane model (canonical + telemetry)
- [`docs/MIGRATION-DUAL-LANE-V1.1.md`](./docs/MIGRATION-DUAL-LANE-V1.1.md) - phased migration, rollback, and verification
- [`docs/QA-HANDOFF-CONTRACT.md`](./docs/QA-HANDOFF-CONTRACT.md) - QA signaling states, transitions, checklist, and handoff rules

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
- `ticket show <id>` — Show ticket details (`id`, `display_id`, or unique `short_id`)
- `ticket move <id> <state>` — Change state
- `ticket edit <id>` — Edit metadata
- `ticket validate` — Check for errors (`--policy-tier` controls governance enforcement)
- `ticket qa ready|fail|pass|reset` — Manage QA signaling in `x_ticket.qa`
- `ticket events write <event>` — Append telemetry lane events
- `ticket events read` — Read telemetry lane events (`--compact` for one-line output)
- `ticket events compact` — Build/apply telemetry compaction snapshots (`--apply` required to write)
- `ticket telemetry-compact` — Legacy alias for `ticket events compact`

Telemetry lane (optional, non-authoritative) can be configured in `.tickets/config.yml`:

```yaml
policy:
  tier: integrity          # hard | integrity | warn | quality | opt-in | strict

telemetry:
  backend: notes            # off | notes | event_ref | http
  notes_ref: refs/notes/ticket-events
  event_ref: refs/tickets/events
  write_fallback: true
  read_fallback: true
```

Storage behavior for v1.1 dual-lane:
- `notes` backend writes immutable per-event note entries (prevents a single ever-growing note blob).
- `event_ref` remains a best-effort fallback lane for environments where notes are unavailable.

Policy tier selection precedence:
- `ticket validate --policy-tier <tier>`
- `TICKET_POLICY_TIER`
- `.tickets/config.yml` (`policy.tier` or `policy_tier`)
- default: `integrity`

Tier behavior:
- `integrity` (default): fail integrity checks only
- `warn`: fail integrity checks, warn on quality checks
- `quality`: fail integrity + quality checks
- `opt-in`: fail integrity checks, warn on quality + strict checks
- `strict`: fail integrity + quality + strict checks
- `hard`: alias of `strict` (full hard-fail mode)

GitHub Actions policy workflow (`.github/workflows/policy-tiers.yml`):
- `integrity` job is required and blocking.
- `quality` job runs in advisory mode (`continue-on-error: true`).
- `strict` job is opt-in via repository variable `TICKET_POLICY_STRICT=1` or manual dispatch input.
- `integrity` job also surfaces QA workflow queues (`ready_for_qa`, `qa_failed`) for automation visibility.

Env overrides:
- `TICKET_TELEMETRY_BACKEND`
- `TICKET_TELEMETRY_NOTES_REF`
- `TICKET_TELEMETRY_EVENT_REF`
- `TICKET_TELEMETRY_WRITE_FALLBACK`
- `TICKET_TELEMETRY_READ_FALLBACK`
- `TICKET_APP_TELEMETRY_URL` (legacy HTTP sink; default backend becomes `http` if set)
- `TICKET_POLICY_TIER`

Backfill noisy history into compact snapshots:
```bash
# dry-run (default)
ticket events compact

# explicit apply mode
ticket events compact --apply
```

## License

- **Protocol** (`/protocol/`): [CC0 1.0](./protocol/LICENSE) — Public domain, use freely
- **Code** (CLI, core, apps): [Apache 2.0](./LICENSE) — Open source
- **Hosted Dashboard**: Proprietary — [ticket.app](https://ticket.app)

## Links

- Website: [ticket.app](https://ticket.app)
- npm: [@ticketdotapp/cli](https://www.npmjs.com/package/@ticketdotapp/cli)
- Issues: Use `.tickets/` in this repo
