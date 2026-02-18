# GitHub Integration Spec (from ChatGPT review)

## Key Insight

**GitHub App OAuth tokens are installation-scoped by design.** This is not a bug.

The standard pattern:
- **OAuth** = identity only (minimal scopes: `read:user`, `user:email`)
- **GitHub App** = repo access + webhooks (installation-scoped)

## The Correct Mental Model

| Token Type | What it sees |
|-----------|--------------|
| Standalone OAuth (`repo` scope) | ALL repos user can access |
| GitHub App user-to-server token | Only repos where app is installed |
| GitHub App installation token | Only repos where app is installed |

## Product Decision

**ticket.app only works on repos where the GitHub App is installed and enabled.**

This is not a drawback. It's a feature:
- Explicit least privilege
- Clear setup
- Stable webhooks
- Stable sync
- Predictable (per-repo fits pricing model)

## Correct Architecture

### 1) Login: OAuth (identity only)
- Scopes: `read:user`, `user:email` (NOT `repo`)
- Purpose: "Who is the user?"

### 2) Integration: GitHub App install
- Purpose: "Which repos can ticket.app access?"
- User installs app, chooses repos
- All syncing uses installation tokens

### UX: One Flow, Two Steps

1. "Sign in with GitHub" (identity)
2. "Install Ticket GitHub App" (repo access)
3. "Enable repositories" (which to index)

Don't talk about "two auth systems." Users understand "sign in" + "install app."

## Database Schema Additions

### user_installations (mapping)
```sql
create table user_installations (
  user_id text not null,
  installation_id bigint not null references installations(id),
  created_at timestamptz not null default now(),
  primary key (user_id, installation_id)
);
```

### repos.installation_id
Link repos to installations, not users.

## API Endpoints

### Onboarding
- `GET /api/github/app/install-url` - get install URL
- `POST /api/github/installations/register` - register installation after callback
- `GET /api/github/installations` - list user's installations
- `GET /api/github/installations/:id/repos` - list repos for installation
- `POST /api/repos/enable` - enable/disable repo

### Dashboard (existing, no change)
- `GET /api/space/repos/:owner/:repo/board` - read from cache
- `POST /api/space/repos/:owner/:repo/refresh` - trigger sync

## Key UX Copy

### "Why don't I see all my repos?"
> "Ticket only indexes repos where the GitHub App is installed and enabled."
> [Manage GitHub App installation →]

### Onboarding steps
1. Sign in ✓
2. Install GitHub App
3. Enable repos

## Why This Works

- Users get explicit control over which repos are indexed
- Webhooks work reliably
- Background sync works without user session
- Rate limits scale per-installation
- Git remains authoritative
- This is how Linear, Vercel, etc. all work
