---
id: 01KHPTPQ8PNKT4NWNAMPV8WZX2
title: Saved views and filters
state: done
priority: p2
labels:
  - dashboard
  - phase-2
---

## Problem

Users need to quickly switch between commonly used filter sets without re-building URL params each time.

## Goal

Save and restore filter combinations as named views.

## Baseline

URL is always the source of truth:
- `?state=ready&priority=p0&label=bug`

## Save Model

Implement both:
1. **Local saved views** (localStorage)
2. **Shareable "saved view links"** (URL only)

## UI

**View selector dropdown in header:**
- "Default"
- Saved views list
- "Save current view…" button

**Save modal:**
- Name (required)
- Scope: local only (default)
- "Copy share link" button

**Manage views:**
- Rename
- Delete
- Pin favorites (optional)

## Data Model (localStorage)

Key: `ticketapp.savedViews.v1`

```json
{
  "views": [
    {
      "id": "sv_abc123",
      "name": "My P0s",
      "repo": "owner/repo",
      "query": "state=ready&priority=p0",
      "createdAt": "..."
    }
  ]
}
```

**Rules:**
- Repo-scoped by default (avoid confusion)
- "All repos" scope for portfolio view (later)

## Acceptance Criteria

- [ ] Save view in < 10 seconds
- [ ] Switching views updates URL and board immediately
- [ ] Share link reproduces exact filter state when opened
- [ ] Views persist across browser sessions

## Cut

- Server-side saved views (future paid)
- Org-shared views (future paid)
