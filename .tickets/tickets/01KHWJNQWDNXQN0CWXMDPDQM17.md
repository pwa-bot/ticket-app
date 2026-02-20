---
id: 01KHWJNQWDNXQN0CWXMDPDQM17
title: Fix short-id collision handling for same-prefix ULIDs
state: in_progress
priority: p1
labels:
  - cli
  - ids
  - reliability
---

## Problem

- Multiple tickets can share the same `short_id` prefix, producing ambiguous display IDs like `TK-01KHWGYA` for different tickets.
- Automation and humans frequently reference `display_id`, so collisions cause the wrong ticket to be selected or require full ULID fallback.
- This is now a workflow blocker for pipeline scheduling and "next ticket" selection.

## Acceptance Criteria

- [ ] `ticket list` shows unambiguous display IDs even when ULID prefixes collide.
- [ ] `ticket show`, `ticket start`, `ticket done`, and `ticket move` accept current IDs and resolve deterministically (no wrong-ticket selection).
- [ ] If a legacy short ID is ambiguous, CLI returns a clear error with exact disambiguation options.
- [ ] Add regression tests covering at least 3 tickets with same prefix and mixed states.
- [ ] Add a migration/backfill path so existing `.tickets/index.json` display IDs are repaired safely.
- [ ] Update docs with the new naming/ID rules and examples.

## Spec

Implement a Display ID v2 scheme:

1. Keep canonical `id` (full ULID) unchanged.
2. Keep `short_id` for convenience, but treat as non-unique hint.
3. Add deterministic `display_id` generation with collision suffixing:
   - Primary: `TK-<first8>`
   - On collision: `TK-<first8>-<seq>` where `<seq>` is stable by sorted full ULID.
4. CLI resolution precedence:
   - full ULID exact match
   - exact `display_id`
   - unique `short_id`
   - otherwise fail with disambiguation list.
5. Rebuild index command updates stored display IDs and preserves determinism.

## Notes

Future ticket naming convention (to reduce ambiguity in queue):
- Prefix title with lane: `[protocol]`, `[dashboard]`, `[worker]`, `[ops]`.
- Use outcome-oriented titles: `<lane>: <user-visible outcome>`.
