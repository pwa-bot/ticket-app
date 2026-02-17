# TASK: Attention Table View (Phase 2 Dashboard)

## Goal

Replace the kanban-only view with a high-density "Attention" table that serves as a supervisory control plane across multiple repos.

## Current State

- `/space` - repo picker (single repo)
- `/space/[owner]/[repo]` - kanban board for one repo
- `/space/[owner]/[repo]/[id]` - ticket detail modal

## Target State

### 1. Multi-Repo Selection (`/space`)

Update the space page to:
- Show checkboxes next to each repo
- "View Selected" button that navigates to `/space?repos=owner/repo1,owner/repo2`
- Store selection in URL params (shareable)

### 2. Attention Table View (`/space?repos=...` or `/space/[owner]/[repo]?view=table`)

A new table view component with columns:

| Column | Source | Notes |
|--------|--------|-------|
| Ticket | `display_id` | Link to modal |
| Title | `title` | Truncate at 60 chars |
| Repo | URL param | Only show if multi-repo |
| State | `state` | Color-coded badge |
| Priority | `priority` | P0 red, P1 orange, P2 yellow, P3 gray |
| Assignee | `assignee` | Show username or "—" |
| Reviewer | `reviewer` | Show username or "—" |
| PR | GitHub API | Link to PR if exists, show count |
| CI | GitHub API | ✓ green, ✗ red, ◐ pending, — none |
| Age | `created` or index `generated_at` | "2d", "1w", etc. |
| Updated | Git or index | "3h ago", "yesterday" |

### 3. View Toggle

Add a toggle between:
- **Board** (current kanban)
- **Table** (new attention view)

Store preference in localStorage + URL param `?view=board|table`

### 4. PR Linking (GitHub API)

Create `/api/repos/[owner]/[repo]/prs` endpoint:
- Fetch open PRs from GitHub
- Match PRs to tickets by:
  - Branch name contains ticket ID (e.g., `tk-01KHPTPP-feature`)
  - PR title contains ticket ID (e.g., `[TK-01KHPTPP] Add feature`)
  - PR body contains ticket ID
- Return `{ ticketId: string, prs: { number, title, state, checks }[] }`

### 5. CI Status

From the PR data, extract check status:
- `success` - all checks passed
- `failure` - any check failed  
- `pending` - checks running
- `unknown` - no checks or no PR

## Components to Create

```
src/components/
  attention-table.tsx      # The main table component
  view-toggle.tsx          # Board/Table toggle
  pr-status-badge.tsx      # PR link + count badge
  ci-status-icon.tsx       # Check status icon
  repo-selector.tsx        # Multi-repo checkbox list
```

## API Routes to Create

```
src/app/api/repos/[owner]/[repo]/prs/route.ts
```

## Implementation Notes

1. **Sorting**: Default sort by priority (P0 first), then by age (oldest first)
2. **Filtering**: Reuse existing state/label filters, add priority filter
3. **Performance**: Fetch PR data lazily (after tickets load) to avoid blocking
4. **Mobile**: Table should horizontally scroll, or collapse to card view

## Acceptance Criteria

- [ ] Can select multiple repos and see combined ticket list
- [ ] Table view shows all columns (Ticket, Title, Repo, State, Priority, Assignee, Reviewer, PR, CI, Age, Updated)
- [ ] Can toggle between Board and Table views
- [ ] PR column shows linked PRs with count
- [ ] CI column shows check status
- [ ] Clicking ticket opens detail modal
- [ ] URL is shareable (repos + view mode in params)
- [ ] Works on mobile (responsive)

## Out of Scope

- Write actions (those come in Phase 3)
- Saved views (separate ticket)
- Real-time updates via webhooks (future)
