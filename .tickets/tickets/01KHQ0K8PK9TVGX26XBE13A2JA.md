---
id: 01KHQ0K8PK9TVGX26XBE13A2JA
title: Optional auto-merge enablement when policy allows
state: done
priority: p2
labels:
  - github
  - automerge
---

## Problem

Dashboard currently auto-merges ticket-change PRs when allowed and checks pass. Some teams want review first before merging.

## Goal

Let users control whether ticket-change PRs auto-merge, per repo and globally.

## Background

Dashboard creates ticket-change PRs for:
- State changes (drag-and-drop)
- Labels/assignee/reviewer/priority changes

## Controls

### 1. Global Setting (user-level)
- Default: Auto-merge enabled
- Toggle: "Auto-merge ticket-change PRs when possible"

### 2. Repo Override
- Toggle per repo in repo settings UI
- "Auto-merge ticket-change PRs"
- Overrides global setting

## Storage (v1.1)

Store settings in hosted DB (user preference):

```sql
user_settings: user_id, auto_merge_default
repo_settings: user_id, owner, repo, auto_merge_override (nullable)
```

Fallback: localStorage if no DB, but hosted is better.

## Auto-merge Decision Logic

When PR created:
1. If repo override set → use it
2. Else → use global default
3. If enabled:
   - Attempt enable auto-merge via GitHub GraphQL
   - If fails due to policy → leave PR open
4. If disabled:
   - Never call enable auto-merge
   - UI shows "Awaiting merge"

## UI States

Pending badge statuses:
- "Auto-merge enabled"
- "Awaiting review"
- "Awaiting merge"
- "Blocked by policy"
- "Conflict"

## Acceptance Criteria

- [ ] Toggle changes behavior immediately for new PRs
- [ ] Existing PRs are not retroactively modified (v1)
- [ ] UI clearly reflects whether auto-merge is enabled for that repo
- [ ] Works without DB (localStorage fallback)

## Cut

- Org-wide policies (later)
- Per-state auto-merge rules (later)
