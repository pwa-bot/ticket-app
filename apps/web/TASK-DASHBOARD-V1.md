# Dashboard v1 Completion

Complete the following in order. Run `pnpm build` after each major change to verify.

## 1. Quick Wins (do first)

### 1a. Repo name in board header
- Currently shows "Kanban Board" — should show the repo name (e.g., "pwa-bot/fasting-app")
- Update `src/app/board/page.tsx` or the board component

### 1b. Scrollable columns
- Each state column (backlog, ready, in_progress, blocked, done) should scroll independently
- When a column has many tickets, it should scroll without affecting other columns
- Use `overflow-y-auto` and a max-height (e.g., `calc(100vh - 200px)`)

## 2. URL Structure Refactor

Refactor from cookie-based repo selection to URL-based.

### Current structure (wrong):
```
/repos   → repo picker
/board   → board (repo stored in cookie)
```

### Target structure:
```
/app                        → repo picker / dashboard home
/app/[owner]/[repo]         → board view
/app/[owner]/[repo]/[id]    → ticket detail (can be modal + URL state)
```

### Steps:
1. Create new route structure in `src/app/app/`
2. Move repo picker to `/app` (or redirect `/app` to `/repos` initially)
3. Create dynamic route `src/app/app/[owner]/[repo]/page.tsx`
4. Board reads owner/repo from URL params, not cookie
5. Create `src/app/app/[owner]/[repo]/[id]/page.tsx` for ticket detail
6. Update all internal links to use new URL structure
7. Keep `/repos` as redirect to `/app` for backwards compat
8. Update API routes if needed (they can stay at `/api/*`)

### Navigation flow:
1. User signs in → redirected to `/app`
2. `/app` shows repo picker
3. User clicks repo → navigates to `/app/pwa-bot/fasting-app`
4. User clicks ticket → URL becomes `/app/pwa-bot/fasting-app/TK-01KHM54A` (modal opens)
5. User can share that URL directly

## 3. Filters in Query Params

Add filter support to board URL:
```
/app/pwa-bot/fasting-app?state=ready&priority=p0&label=ux
```

### Steps:
1. Add filter UI (dropdowns or pills) above the board
2. Read filters from `searchParams`
3. Filter tickets client-side from index.json
4. Update URL when filters change (using `router.push` or `router.replace`)
5. Back button should restore previous filter state

## 4. PR Linking in Dashboard

Show linked PRs on ticket detail.

### Convention (from SPEC.md):
- PR title contains `[TK-<short_id>]` or `TK-<short_id>`
- Or branch name contains `tk-<short_id>`

### Steps:
1. When loading ticket detail, fetch PRs from GitHub API:
   - `GET /repos/:owner/:repo/pulls?state=all&head=:owner:tk-{short_id}*` (branch match)
   - Or search: `GET /search/issues?q=repo:owner/repo+type:pr+TK-{short_id}+in:title`
2. Display linked PRs in ticket detail (title, state, URL)
3. Cache PR lookups to avoid rate limits

## 5. Manual Refresh Button

Add a refresh button to the board header that:
1. Clears any cached index.json
2. Re-fetches from GitHub API
3. Shows a loading spinner while refreshing

---

## Verification

After completing all tasks:
1. `pnpm build` passes
2. Can navigate to `/app/pwa-bot/fasting-app` directly (deep link works)
3. Can share ticket URL `/app/pwa-bot/fasting-app/TK-01KHM54A`
4. Filters persist in URL and work with back button
5. Columns scroll independently with many tickets
6. Repo name shows in header

Output `<promise>DONE</promise>` when all complete.
