# Ticket Protocol v1.0.0

**The open standard for machine-readable work.**

---

## Abstract

The Ticket Protocol defines a file format and structure for storing work items (tickets) as markdown files within a Git repository. It is designed to be human-readable, machine-parseable, and implementation-agnostic.

Any tool — CLI, web app, IDE plugin, AI agent — can read and write tickets that conform to this protocol.

---

## Status

- **Version:** 1.0.0
- **Status:** Draft
- **License:** CC0 1.0 (Public Domain)

---

## Conventions

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

---

## 1. Repository Layout

### 1.1 Conformance Profiles

This protocol defines two conformance profiles:

**Core Profile (minimal)**

A Core-conforming repository MUST have:
- `.tickets/tickets/` directory
- Valid ticket files per §2

`config.yml` and `index.json` are OPTIONAL in Core profile.

Core Profile implementations MUST NOT require `config.yml` or `index.json` to read tickets.

**Indexed Profile**

An Indexed-conforming repository MUST have:
- `.tickets/config.yml`
- `.tickets/index.json` (derived)
- Valid ticket files per §2

Implementations that claim Indexed profile support MUST regenerate `index.json` on write operations.

> ticket.app requires the Indexed profile.

### 1.2 Directory Structure

```
.tickets/
├── config.yml          # REQUIRED for Indexed profile
├── index.json          # REQUIRED for Indexed profile (derived)
├── template.md         # OPTIONAL
└── tickets/            # REQUIRED
    ├── {ULID}.md
    └── ...
```

### 1.3 Tickets Directory

- Ticket files MUST be stored in `.tickets/tickets/`
- Each ticket MUST be a single markdown file
- Filename MUST be `{ULID}.md`

**ULID Requirements:**
- ULID MUST be exactly 26 characters using Crockford Base32 (0-9, A-Z excluding I, L, O, U).
- The filename stem MUST equal the `id` field exactly.
- Implementations SHOULD write ULIDs in uppercase for case-insensitive filesystem compatibility.
- Implementations SHOULD treat ticket IDs case-insensitively when resolving, but MUST write canonical uppercase.

---

## 2. Ticket File Format

### 2.1 Structure

A ticket file MUST consist of:
1. YAML frontmatter delimited by `---`
2. Markdown body

The YAML frontmatter block MUST begin at the first line of the file and MUST be delimited by exact `---` lines.

```markdown
---
id: 01ARZ3NDEKTSV4RRFFQ69G5FAV
title: Example ticket
state: ready
priority: p1
labels: []
---

Markdown body content here.
```

### 2.2 Encoding and Line Endings

- Files MUST be UTF-8 encoded.
- Implementations MUST accept both LF and CRLF line endings.

### 2.3 Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Full ULID. MUST match filename stem exactly. |
| `title` | string | Human-readable. MUST NOT be empty or whitespace-only after trimming. SHOULD be ≤200 characters. |
| `state` | enum | Current workflow state. See §3. |
| `priority` | enum | Priority level: `p0`, `p1`, `p2`, `p3` |
| `labels` | array | MUST be present, MAY be empty. See below for label rules. |

**Case handling for `state` and `priority`:**
- Implementations MUST treat values case-insensitively when reading.
- Implementations SHOULD write values in lowercase.

**Label rules:**
- `labels` MUST be an array of strings.
- Each label SHOULD be lowercase and SHOULD match `^[a-z0-9][a-z0-9_-]{0,31}$`.
- Implementations MUST tolerate unknown label strings when reading.
- Implementations SHOULD normalize labels to lowercase when writing.
- Implementations SHOULD de-duplicate labels when writing.
- Order SHOULD be preserved in ticket files.

### 2.4 Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `assignee` | string | Actor responsible for work. See §2.5. |
| `reviewer` | string | Actor responsible for review. See §2.5. |

### 2.5 Actor Format

Actors MUST match the pattern `{type}:{slug}`.

**Type:**
- MUST be `human` or `agent` in v1. Other types are reserved.
- Implementations MUST treat type case-insensitively when reading.
- Implementations SHOULD write type in lowercase.

**Slug:**
- MUST be lowercase ASCII, 1–32 characters, matching `^[a-z0-9][a-z0-9_-]{0,31}$`.
- MUST NOT contain whitespace.

**Examples:**
- `human:morgan`
- `agent:openclaw`

### 2.6 Derived Fields

The following fields MUST NOT be stored in frontmatter. Implementations SHOULD derive them from Git history:

| Field | Source |
|-------|--------|
| `created_at` | Git: first commit containing the file |
| `updated_at` | Git: most recent commit modifying the file |

### 2.7 Extension Namespace

The `x_ticket` namespace is reserved for extensions.

- Implementations that rewrite frontmatter MUST preserve `x_ticket` semantically (formatting and ordering MAY change).
- Implementations MUST NOT drop unknown frontmatter keys.
- Implementations MAY ignore unknown keys when processing.

```yaml
x_ticket:
  custom_field: value
```

This ensures forward compatibility. When future protocol versions add fields like `estimate` or `relations`, older tools will not delete them.

### 2.8 Parsing Rules

- YAML MUST NOT contain tabs.
- Implementations MUST ignore unknown top-level keys when processing.
- **Forward compatibility:** Implementations that rewrite frontmatter MUST preserve unknown keys. The `x_ticket` namespace is reserved for extensions and MUST be preserved semantically.

---

## 3. Workflow States

### 3.1 States

| State | Description |
|-------|-------------|
| `backlog` | Not ready to work |
| `ready` | Specced and ready to start |
| `in_progress` | Actively being worked |
| `blocked` | Waiting on external dependency |
| `done` | Complete |

### 3.2 Transitions

Implementations MUST enforce the following transition rules:

```
backlog       → ready
ready         → in_progress
in_progress   → done
in_progress   → ready
*             → blocked
blocked       → ready
blocked       → in_progress
```

The `done` state is terminal. Implementations MUST NOT allow transitions out of `done`.

### 3.3 Custom Workflows

Future protocol versions MAY define additional workflows. The `workflow` field in `config.yml` indicates which workflow is in use. If omitted, assume `simple-v1`.

---

## 4. Index File

### 4.1 Purpose

The index file (`.tickets/index.json`) provides a pre-computed summary of all tickets for efficient querying without parsing individual files.

### 4.2 Generation

- In an **Indexed profile** repository, implementations that modify ticket files MUST regenerate `index.json` before completing the operation.
- In a **Core profile** repository, `index.json` MAY be omitted.
- If `index.json` conflicts with ticket files, ticket files are authoritative.
- Implementations MUST tolerate missing or stale `index.json` (both profiles).
- Implementations SHOULD offer a rebuild operation or mode.

### 4.3 Schema

```json
{
  "format_version": 1,
  "generated_at": "2026-02-16T18:22:11Z",
  "workflow": "simple-v1",
  "tickets": [
    {
      "id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      "short_id": "01ARZ3ND",
      "display_id": "TK-01ARZ3ND",
      "title": "Example ticket",
      "state": "ready",
      "priority": "p1",
      "labels": [],
      "assignee": "human:morgan",
      "reviewer": "agent:openclaw",
      "path": ".tickets/tickets/01ARZ3NDEKTSV4RRFFQ69G5FAV.md"
    }
  ]
}
```

### 4.4 Envelope Fields

| Field | Type | Description |
|-------|------|-------------|
| `format_version` | integer | Schema version. Currently `1`. |
| `generated_at` | string | ISO 8601 timestamp in UTC. |
| `workflow` | string | Workflow identifier. Default: `simple-v1`. |
| `tickets` | array | Array of ticket entries. |

### 4.5 Ticket Entry Schema

**Required fields per entry:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Full ULID |
| `short_id` | string | First 8 characters of ULID |
| `display_id` | string | `{id_prefix}-{short_id}` |
| `title` | string | Ticket title |
| `state` | string | Current state |
| `priority` | string | Priority level |
| `labels` | array | Labels (may be empty) |
| `path` | string | Relative path to ticket file |

**Optional fields per entry:**

| Field | Type | Description |
|-------|------|-------------|
| `assignee` | string | Actor assigned (if set) |
| `reviewer` | string | Reviewer assigned (if set) |

Implementations MUST ignore unknown keys in `index.json`. The index is derived and disposable; there is no requirement to preserve unknown fields.

### 4.6 Sorting

To ensure deterministic output, tickets MUST be sorted by:
1. State order: `backlog`, `ready`, `in_progress`, `blocked`, `done`
2. Priority order: `p0`, `p1`, `p2`, `p3`
3. ID (lexicographic)

---

## 5. Configuration

### 5.1 config.yml

The configuration file is located at `.tickets/config.yml`:

```yaml
format_version: 1
id_prefix: TK
workflow: simple-v1
```

### 5.2 Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `format_version` | integer | Protocol version. Currently `1`. |

### 5.3 Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id_prefix` | string | `TK` | Prefix for display IDs |
| `workflow` | string | `simple-v1` | Workflow identifier |

### 5.4 ID Terminology

| Term | Definition | Example |
|------|------------|---------|
| `id` | Full ULID (26 chars) | `01ARZ3NDEKTSV4RRFFQ69G5FAV` |
| `short_id` | First 8 chars | `01ARZ3ND` |
| `display_id` | `{id_prefix}-{short_id}` | `TK-01ARZ3ND` |

---

## 6. Validation

A conforming implementation SHOULD validate tickets against these rules.

> **Note:** Validation rules are RECOMMENDED, not required for conformance.

### 6.1 File-Level

- [ ] File is valid UTF-8
- [ ] Frontmatter is valid YAML
- [ ] Frontmatter delimiters are exactly `---`

### 6.2 Field-Level

- [ ] `id` field exists and matches filename stem
- [ ] `title` is non-empty string
- [ ] `state` is one of: `backlog`, `ready`, `in_progress`, `blocked`, `done`
- [ ] `priority` is one of: `p0`, `p1`, `p2`, `p3`
- [ ] `labels` exists and is an array (may be empty)

### 6.3 Index-Level (Indexed profile only)

- [ ] All ticket files have corresponding entries in index
- [ ] No orphan entries in index (ticket file must exist)
- [ ] Index is sorted correctly

---

## 7. Interoperability

### 7.1 Reading Tickets

Any implementation reading tickets:
- MUST parse YAML frontmatter
- MUST handle missing optional fields gracefully
- MUST preserve unknown fields when writing back
- SHOULD use `index.json` for listing (avoid parsing all files)

### 7.2 Writing Tickets

Any implementation writing tickets:
- MUST generate valid ULID for new tickets
- MUST regenerate `index.json` after mutations (Indexed profile)
- MUST preserve `x_ticket` namespace and unknown frontmatter keys
- MAY auto-commit changes to Git

### 7.3 URI Scheme (Reserved, Non-Normative)

The `ticket://` URI scheme is reserved for cross-references:

```
ticket://{namespace}/{repository}/{short_id}
ticket://{host}/{namespace}/{repository}/{short_id}
```

Examples:
- `ticket://pwa-bot/myapp/01ARZ3ND`
- `ticket://github.com/pwa-bot/myapp/01ARZ3ND`

The URI scheme is reserved and non-normative in v1. Implementations MAY render these as links. Implementations MAY safely ignore them.

---

## 8. Security Considerations

### 8.1 No Secrets

Ticket files MUST NOT contain secrets (API keys, tokens, passwords).

### 8.2 Minimize PII

Ticket files SHOULD NOT contain PII (emails, phone numbers, addresses, private names).

Public contributor names or GitHub handles MAY appear.

### 8.3 Rendering Safety

Implementations that render markdown in a browser MUST sanitize untrusted content to prevent XSS attacks.

### 8.4 Source of Truth

The Git repository is the authoritative source. Any caches, databases, or indexes are derived and disposable.

---

## 9. Versioning

### 9.1 Format Version

The `format_version` field in `config.yml` and `index.json` indicates the on-disk schema version.

- `format_version` increments on breaking changes to the on-disk schema.
- Current version: `1`

### 9.2 Protocol Version

The protocol version (e.g., `1.0.0`) follows semantic versioning:

- **Major:** Breaking changes to required fields or behavior
- **Minor:** New optional fields, clarifications, non-breaking additions
- **Patch:** Typo fixes, clarifications that don't change behavior

### 9.3 Forward Compatibility

Implementations MUST ignore unknown fields for forward compatibility. This allows newer protocol versions to add optional fields without breaking older tools.

---

## Appendix A: Example Ticket

```markdown
---
id: 01ARZ3NDEKTSV4RRFFQ69G5FAV
title: Add user authentication
state: ready
priority: p1
labels: [security, mvp]
assignee: agent:openclaw
reviewer: human:morgan
---

## Problem

Users cannot log in. The app is open to anyone.

## Acceptance Criteria

- [ ] GitHub OAuth login flow
- [ ] Session stored in HTTP-only cookie
- [ ] Logout endpoint clears session

## Notes

Use next-auth for implementation.
```

---

## Appendix B: Example Index

```json
{
  "format_version": 1,
  "generated_at": "2026-02-16T12:00:00Z",
  "workflow": "simple-v1",
  "tickets": [
    {
      "id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      "short_id": "01ARZ3ND",
      "display_id": "TK-01ARZ3ND",
      "title": "Add user authentication",
      "state": "ready",
      "priority": "p1",
      "labels": ["security", "mvp"],
      "assignee": "agent:openclaw",
      "reviewer": "human:morgan",
      "path": ".tickets/tickets/01ARZ3NDEKTSV4RRFFQ69G5FAV.md"
    }
  ]
}
```

---

## Appendix C: Implementations

| Implementation | Type | Profile | Status |
|----------------|------|---------|--------|
| [ticket-app/cli](https://github.com/pwa-bot/ticket-app) | Reference CLI | Indexed | v1.0 |
| [ticket.app](https://ticket.app) | Web Dashboard | Indexed | v1.0 |

---

## Changelog

### v1.0.0 (2026-02-16)

- Initial release
- Five-state workflow: backlog, ready, in_progress, blocked, done
- ULID-based identifiers
- YAML frontmatter + Markdown body
- Core and Indexed conformance profiles
- index.json for efficient querying
- Extension namespace (`x_ticket`)
- Actor format with type validation
