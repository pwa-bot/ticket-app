# Webhook Architecture

## Invariants

1. **Git is authoritative.** Ticket files in `.tickets/` are the source of truth.
2. **Postgres is derived cache.** Can be rebuilt from GitHub at any time.
3. **index.json is the query surface.** Board data comes from this single file.

## Architecture

```
GitHub ──webhook──▶ ticket.app ──▶ Postgres (cache)
   │                    │                │
   │                    │                ▼
   │                    │         UI reads cache
   │                    │
   └── App installation token (high rate limit)
   
User ──OAuth──▶ ticket.app (identity only)
```

## Phase A: Push Webhook (eliminates most polling)

**Trigger:** `push` to default branch

**Action:**
1. Verify webhook signature
2. Fetch `.tickets/index.json` using installation token
3. Store parsed results in `tickets` table with `head_sha`
4. UI reads from DB (no GitHub calls)

**Cache schema additions:**
- `head_sha` — commit SHA this data was derived from
- `webhook_synced_at` — when webhook last updated

## Phase B: PR Webhook

**Trigger:** `pull_request` (opened, closed, merged, synchronize)

**Action:**
1. Match PR to ticket(s) by branch name / title / body
2. Cache PR metadata in `ticket_prs` table
3. UI reads PR list from DB

## Phase C: CI Webhook

**Trigger:** `check_run` (completed)

**Action:**
1. Find PR for this check
2. Update CI status in `ticket_prs`
3. UI reads CI status from DB

## Phase D: Fallback

- Manual refresh button triggers sync
- Stale-while-revalidate if webhook missed
- Periodic reconciliation job (daily)

## GitHub App vs OAuth

| Purpose | Auth Method |
|---------|-------------|
| User identity | OAuth |
| Repo access | App installation token |
| Webhooks | App |
| Higher rate limits | App (5k/hr per installation) |

## Cache Rebuild

At any time, we can:
```sql
TRUNCATE tickets, ticket_prs, repos;
```
Then re-sync from GitHub. No data loss.
