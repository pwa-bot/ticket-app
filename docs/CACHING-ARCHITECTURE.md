# ticket.app Caching Architecture v1.1 (Derived Cache, Git-Authoritative)

## Goal

Make dashboard reads fast and reliable at scale without hitting GitHub rate limits, while keeping Git as the source of truth.

## Principles

1. **Git is authoritative.** Postgres is a derived cache only.
2. **Cache is disposable.** We can always rebuild from GitHub.
3. **Sync should be incremental.** Prefer SHA-based detection over full refresh.
4. **Reads are cached.** Writes still go to GitHub (PR-based).
5. **UI is honest about freshness.** Show "Updated X minutes ago" and "Syncing" states.

---

## Problem

Fetching `.tickets/index.json`, ticket files, and PR status on every dashboard load can exceed GitHub REST rate limits (5,000 requests/hour per token) and slows the UI.

We need:
* near-zero GitHub API calls for common reads
* controlled sync behavior
* reliable "pending change" UX

---

## Solution Overview

Store a **derived cache** in Postgres:
* Cached `index.json` and (optionally) ticket markdown blobs
* Parsed ticket fields for querying
* Repo sync metadata (last index sha, last sync)
* Pending change PR tracking

Dashboard reads from Postgres 90% of the time, and syncs from GitHub only when needed.

---

## Data Flow

### Reads (90%)

```
Dashboard → GET /api/repos/:owner/:repo/tickets → Postgres
- returns cached tickets + cached index metadata
- includes freshness: last_synced_at
- can show "syncing" if a refresh is in progress
```

### Cache Updates

Cache can update via:
1. **On-demand**: user opens repo, if stale then sync
2. **Webhook**: GitHub push/PR merged triggers sync
3. **Manual**: user clicks "Refresh now"

### Writes (10%)

Writes remain GitHub-native:

```
Dashboard action (drag/edit)
→ Create ticket-change PR in GitHub
- does NOT change canonical state immediately
- creates "pending change" record in Postgres
- UI shows pending until PR merges
```

When PR merges:
* webhook triggers sync
* index.json sha changes
* cache updates canonical fields
* pending badge disappears

---

## Sync Strategy (SHA-first incremental)

### Key idea

Always fetch `.tickets/index.json` first. Use its SHA to determine whether anything changed.

### Repo sync algorithm

When sync is triggered:

1. Fetch `.tickets/index.json` from default branch.
2. Compare `index_sha` with cached `last_index_sha`.
3. If unchanged:
   * update `last_synced_at`
   * stop (no wasted API calls)
4. If changed:
   * parse index.json entries
   * upsert rows in `tickets` table (title/state/priority/labels/path)
   * store raw index.json blob + sha
   * set `last_index_sha` to new sha
   * update `last_synced_at`

### Ticket body fetching

Do NOT fetch every ticket markdown file during sync (too expensive).

Instead:
* fetch ticket markdown lazily when user opens detail
* store markdown blob + sha
* refresh if sha mismatch later

This keeps GitHub calls extremely low.

---

## Database Schema (Postgres / Neon)

### `repos`

Represents a GitHub repo that the user has enabled.

| Field | Type | Description |
|-------|------|-------------|
| id | text PK | Generated ULID |
| user_id | text | Owner of connection |
| owner | text | GitHub owner |
| repo | text | GitHub repo name |
| full_name | text UNIQUE | `owner/repo` |
| default_branch | text | Usually "main" |
| last_seen_head_sha | text | Optional |
| last_index_sha | text | SHA of index.json blob |
| last_synced_at | timestamp | Last successful sync |
| sync_status | enum | idle, syncing, error |
| sync_error | text | Error message if status=error |
| created_at, updated_at | timestamp | |

### `repo_blobs`

Stores raw derived blobs, disposable.

| Field | Type | Description |
|-------|------|-------------|
| repo_full_name | text FK | |
| path | text | `.tickets/index.json` or `.tickets/tickets/<ULID>.md` |
| sha | text | Git blob SHA |
| content_text | text | Raw file content |
| fetched_at | timestamp | |

Primary key: `(repo_full_name, path)`

### `tickets`

Parsed fields for querying.

| Field | Type | Description |
|-------|------|-------------|
| repo_full_name | text FK | |
| id | text | Full ULID |
| short_id | text | |
| display_id | text | |
| title | text | |
| state | text | |
| priority | text | |
| labels | jsonb | Array of strings |
| assignee | text | |
| reviewer | text | |
| path | text | Path to ticket file |
| ticket_sha | text | SHA of ticket file (if known) |
| index_sha | text | SHA of index.json used |
| cached_at | timestamp | |

Primary key: `(repo_full_name, id)`

### `pending_changes`

Tracks ticket-change PRs created by the dashboard.

| Field | Type | Description |
|-------|------|-------------|
| id | text PK | Generated ULID |
| repo_full_name | text FK | |
| ticket_id | text | ULID of ticket being changed |
| pr_number | integer | |
| pr_url | text | |
| branch | text | |
| change_summary | text | Human-readable |
| change_patch | jsonb | The actual changes |
| status | enum | creating_pr, pending_checks, waiting_review, mergeable, auto_merge_enabled, conflict, failed, merged, closed |
| created_at, updated_at | timestamp | |

---

## API Endpoints

### Read endpoints

* `GET /api/repos/:owner/:repo/tickets` — Returns cached tickets + freshness metadata
* `GET /api/repos/:owner/:repo/tickets/:ticketId` — Returns ticket markdown (lazy-fetched)

### Sync endpoints

* `POST /api/repos/:owner/:repo/sync` — Triggers sync job

### Write endpoints

* `POST /api/repos/:owner/:repo/tickets/:ticketId/changes` — Creates ticket-change PR + pending_changes record

---

## UI Freshness and States (required)

Board header must show:
* "Updated 2m ago"
* "Syncing…" indicator when sync in progress
* "Using cached data (rate limited)" if GitHub calls fail

Pending changes:
* Show pending badge on ticket
* Link to PR
* Only update canonical state when PR merges and sync confirms it

---

## Failure modes and recovery

### Missing or stale index.json in repo

If index.json missing/out of sync:
* return error: "index.json missing or out of sync. Run `ticket rebuild-index` and push."
* do not attempt expensive rebuild via GitHub API

### Rate limited

* serve stale cache if available
* set sync_status=error with message
* UI shows "using cached data"

### Permission lost

* mark repo as "access lost"
* stop syncing
* UI shows repo needs reconnect

---

## Acceptance Criteria

1. Opening board view uses Postgres only in steady state.
2. Sync fetches index.json only; does not fetch all ticket files.
3. Ticket detail fetches markdown lazily and caches it.
4. Dashboard write creates PR and pending_changes record.
5. UI shows pending until PR merges.
6. PR merge triggers sync (webhook or manual), canonical state updates.
7. Cache always disposable; deleting Postgres still allows rebuild from GitHub.
