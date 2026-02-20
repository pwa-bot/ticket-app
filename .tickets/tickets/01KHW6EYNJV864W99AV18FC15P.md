---
id: 01KHW6EYNJV864W99AV18FC15P
title: Saved views v1 shareable operational queues
state: done
priority: p1
labels:
  - dashboard
  - saved-views
  - product
---

## Problem

Users wanted to save filter configurations (repo subset + search + tab) as named views and share them with teammates. The existing implementation was localStorage-only with no sharing UX or feedback.

## Acceptance Criteria

- [x] Save current filter state as a named view (persisted to localStorage)
- [x] Rename and delete saved views
- [x] Shareable URLs – all filter state is encoded in URL query params
- [x] Share link dialog with URL preview and one-click copy
- [x] Copy confirmation feedback (toast / button state change)
- [x] `SaveViewBanner` – recipients of shared URLs see a banner offering to save the view
- [x] SaveViewBanner dismisses after save or manual dismiss
- [x] Saved views dropdown integrated on /space portfolio dashboard
- [x] Comprehensive Playwright E2E tests (21 test cases)

## Spec

### Components

**`SavedViewsDropdown`** (enhanced)
- Trigger shows active view name / "Custom filter" / "All tickets"
- Dropdown: list saved views, "Save current view", "Share link…", "All tickets"
- Per-view: rename + delete via hover actions
- "Share link…" opens `ShareViewDialog`

**`ShareViewDialog`** (new, inside saved-views.tsx)
- Shows full shareable URL in a read-only input
- Copy button with in-dialog Copied! feedback
- "Save to my views" if view not yet saved; "Already saved" otherwise

**`SaveViewBanner`** (new export from saved-views.tsx)
- Appears when `currentQuery` is non-empty and doesn't match any saved view
- "Save to my views" → `SaveViewModal`
- "Copy link" → clipboard
- Dismiss button removes the banner for this session

**`lib/saved-views.ts`**
- Added `buildShareUrl(basePath, query)` utility

### Integration

- `portfolio-attention-view.tsx` imports `SaveViewBanner` and renders it above the main content area
- `currentQuery` excludes `ticket` and `ticketRepo` params so modal deep-link state is not baked into saved views

## Notes

Views v1 is intentionally localStorage-only. Cross-user sharing works via URL params (stateless). Backend persistence deferred to v2.
