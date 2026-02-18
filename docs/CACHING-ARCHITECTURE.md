# ticket.app Caching Architecture v1.1 (Derived Cache, Git-Authoritative)

> **Core Promise:** Git is authoritative. Everything else is derived and disposable.

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

---

## Ethos Guardrails (Non-Negotiables)

### Purpose

Postgres exists to make the dashboard fast and reliable. It must never become a second source of truth. Ticket's core promise is: **Git is authoritative. Everything else is derived and disposable.**

These guardrails are requirements.

---

### 1) Git is the only canonical source of truth

* The canonical ticket state is the content of:
  * `.tickets/tickets/*.md` and `.tickets/index.json` in the repo
* Postgres is a **derived cache** only.
* If Postgres and Git disagree, **Git wins**.

Implementation requirements:
* Any view that depends on cached data must include `last_synced_at` and display a freshness indicator.
* The system must support a "rebuild from GitHub" path that repopulates Postgres.

---

### 2) All writes must go through GitHub (PRs or GitHub primitives)

* Dashboard write actions MUST create a PR that edits ticket files (and index.json).
* The dashboard MUST NOT update canonical ticket state by writing directly to Postgres.
* The dashboard MUST NOT write directly to main branch by default.

Allowed write mechanisms:
* PRs that modify `.tickets/tickets/*.md` and `.tickets/index.json`
* GitHub PR reviews, CODEOWNERS, branch protection, checks
* PR comments that agents can respond to

Forbidden:
* Any DB-only workflow state changes
* Any DB-only approvals or comments that are not mirrored in GitHub/Git

---

### 3) Pending UI is allowed, but must be explicit

* The dashboard MAY show "pending changes" immediately after creating a PR.
* Pending changes MUST be clearly labeled as pending and MUST link to the PR.
* The ticket must not appear in the new canonical state/column until the PR merges and sync confirms it.

Implementation requirements:
* `pending_changes` table is allowed as UI state only.
* When PR merges, sync must update canonical cached state from index.json.

---

### 4) Cache must be disposable and reconstructable

* If the database is deleted, the system must recover by re-syncing from GitHub.
* Therefore, Postgres must store only:
  * derived index and ticket metadata
  * derived raw blobs (index.json, ticket markdown) for speed
  * pending PR UI state

Forbidden:
* Storing business-critical data that cannot be rebuilt from GitHub (unless explicitly scoped to a future paid product like Intake).

---

### 5) Cache invalidation must be SHA-based

* Sync must use `.tickets/index.json` SHA to detect change.
* Sync must not re-fetch all ticket files on every refresh.
* Ticket markdown should be fetched lazily on ticket detail open.

This ensures:
* predictable GitHub API usage
* correctness tied to Git state

---

### 6) Protocol-first compatibility must remain intact

* Any changes made by dashboard PRs must preserve:
  * unknown frontmatter keys
  * `x_ticket` namespace semantically
* Dashboard must remain protocol compliant:
  * it edits the same files the CLI edits
  * it does not invent a proprietary state model

---

### 7) Pricing must align with ethos

* Protocol and CLI remain free.
* Paid features are coordination and reliability:
  * multi-repo portfolio
  * saved views
  * webhooks/realtime refresh
  * Slack routing
  * governance checks
  * write actions convenience
* We must never charge for "owning the data," since users keep their data in Git.

---

### Litmus test for every feature

Ask: **If Postgres is wiped, can we reconstruct this from GitHub and the repo?**

* If yes: allowed.
* If no: either redesign or explicitly label it as a separate hosted product area (example: future Intake inbox with PII).

---

## Engineering Review Checklist

Use this checklist on every PR touching: dashboard data fetching, caching/sync, write actions, GitHub integration, rules/notifications.

### A) Canonical truth and data flow

- [ ] Does this change keep Git authoritative for canonical ticket state?
- [ ] If DB and Git disagree, does the code explicitly choose Git?
- [ ] Can this feature recover if Postgres is wiped (re-sync from GitHub)?
- [ ] Does the UI show freshness (`last_synced_at`) and sync status?

### B) Writes and "pending" behavior

- [ ] Are all write actions implemented as PR-based changes to ticket files (and index.json)?
- [ ] Are we avoiding direct writes to the default branch by the dashboard?
- [ ] Are we avoiding DB-only canonical state changes?
- [ ] Does the UI show a clear "pending" state until PR merge is confirmed?
- [ ] Does the pending UI always link to the PR in GitHub?
- [ ] On PR merge, do we refresh from index.json and only then update canonical UI state?

### C) Protocol compliance and forward compatibility

- [ ] Does the ticket patch logic preserve unknown frontmatter keys semantically?
- [ ] Does it preserve `x_ticket` semantically?
- [ ] Are we using exact `---` delimiters at file start when rewriting?
- [ ] Are we maintaining required fields (`id`, `title`, `state`, `priority`, `labels`)?
- [ ] Are state transitions validated against protocol rules before PR creation?
- [ ] Are labels normalized on write and stored in index.json deterministically?

### D) Cache correctness (derived-only)

- [ ] Are we storing raw blobs (`index.json`, ticket markdown) as derived cache only?
- [ ] Is the cache invalidation SHA-based (index.json sha)?
- [ ] Does sync fetch index.json first and short-circuit when unchanged?
- [ ] Are ticket markdown files fetched lazily on detail open (not bulk during sync)?
- [ ] Are error messages actionable when index is missing/out of sync (`ticket rebuild-index`)?

### E) GitHub integration safety

- [ ] Are GitHub OAuth tokens stored encrypted and never logged?
- [ ] Are repo access scopes least-privilege and repo allowlist enforced?
- [ ] If using webhooks: signatures verified, delivery deduped, retries safe?
- [ ] Are GitHub API calls rate-limit aware, with backoff and stale-cache fallback?
- [ ] Do we avoid creating noisy PRs (one PR per action, or batch safely)?

### F) Observability and debugging

- [ ] Do we log correlation IDs for sync jobs and PR creation flows?
- [ ] Do we emit structured errors with stable error codes to the frontend?
- [ ] Can a human see why something is pending/failed/conflicted?
- [ ] Are sync errors persisted in `repos.sync_error` and shown in UI?

### G) Product/UX integrity

- [ ] Does the UX avoid "lying" (showing canonical state changed before merge)?
- [ ] Are pending states visually distinct from canonical states?
- [ ] Is there a clear recovery path for failures (open PR, retry, rebuild index)?

### H) Pricing/ethos alignment (sanity check)

- [ ] Does this feature introduce a DB-only value that would create lock-in?
- [ ] If yes, is it explicitly scoped as a separate hosted product (example: future Intake)?
- [ ] Otherwise, does it fit the "pay for coordination, not storage" model?

---

### "Stop the line" conditions (must fix before merge)

* Any canonical ticket state change written to Postgres without a PR/merge
* Any write path that bypasses GitHub branch protection
* Dropping unknown frontmatter keys or `x_ticket`
* Sync that requires DB state to be correct (not reconstructable)
* UI showing final state before PR merge is confirmed
