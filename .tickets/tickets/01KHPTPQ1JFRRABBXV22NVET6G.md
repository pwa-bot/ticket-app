---
id: 01KHPTPQ1JFRRABBXV22NVET6G
title: Ticket detail modal with PR/activity info
state: ready
priority: p2
labels:
  - dashboard
  - phase-2
---

## Problem

Clicking a ticket from board/list should open a modal with full detail, without losing context. Currently no detail view exists.

## Goal

Deep-linkable ticket detail modal that shows full ticket info, linked PRs, and activity.

## UX Requirements

**Routes:**
- `/space/:owner/:repo` — board view
- `/space/:owner/:repo/t/:ticketId` — opens modal over board

**Behavior:**
- Closing modal returns to board, preserves query params (filters)
- Keyboard: `Esc` closes modal
- Desktop: right-side panel or centered modal
- Mobile: full-screen sheet (v1.1, web-only ok for now)

## Data Sections

### 1. Header
- Display ID `TK-xxxx`
- Title
- Repo badge
- State pill + priority pill
- Pending badge if change PR exists
- Actions: Open on GitHub (file), Copy link, Open PR

### 2. PR / Merge Status Block
- Linked PRs list (by branch naming convention)
- PR title, number, status
- Checks summary (pass/fail/running)
- Review summary (approvals)
- Mergeability (clean/blocked/conflict)
- If pending ticket-change PR exists, show at top with status

### 3. Ticket Body
- Render Markdown body (exclude frontmatter)
- Preserve headings and checklists

### 4. Activity Timeline (MVP)
- Last 10 relevant events:
  - ticket-change PR created/merged
  - linked PR opened/merged
  - state changes

### 5. Metadata Editor (write actions via PR)
- Priority dropdown
- Labels editor
- Assignee / Reviewer
- Move state dropdown
- Each action creates ticket-change PR + pending badge

## Technical Requirements

- On modal open: fetch ticket file, linked PRs, PR status
- Cache ticket file contents in-memory for session
- Cache PR status for 10-30s
- Deep link loads board then opens modal automatically

## Error States

- Ticket file missing: "Ticket file not found. Run `ticket rebuild-index` and push."
- PR lookup fails: "PR status unavailable" but still render ticket

## Acceptance Criteria

- [ ] Opening modal does not refetch board data unnecessarily
- [ ] Deep link loads board then opens modal automatically
- [ ] Pending badge and PR link visible in modal and board
- [ ] Metadata edits from modal create PR and show pending state

## Cut

- Editing Markdown body in UI (later)
- Comments inside dashboard (use PR comments)
