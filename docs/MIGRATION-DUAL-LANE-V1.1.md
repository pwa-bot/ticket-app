# Migration Guide: Protocol v1.1 Dual-Lane Model

Audience: maintainers of existing `.tickets` repositories  
Outcome: adopt telemetry lane without breaking canonical compatibility

## 1. Migration Goals

- Keep canonical `.tickets/` behavior unchanged and interoperable.
- Move high-frequency event chatter out of canonical commit history.
- Preserve deterministic rebuild from canonical files alone.

## 2. Prerequisites

- Existing repo already valid under Protocol v1.0.0.
- CLI/tooling can still run `ticket validate` and `ticket rebuild-index`.
- Team agrees that telemetry is non-authoritative.

## 3. Phased Migration Plan

### Phase 0: Baseline and safety snapshot

1. Validate current canonical health:
```bash
ticket validate --ci
```
2. Rebuild index to prove deterministic state:
```bash
ticket rebuild-index
```
3. Commit any canonical cleanup before telemetry changes.

Exit criteria:
- Canonical validation passes.
- No unresolved index drift.

### Phase 1: Enable telemetry lane in shadow mode

1. Start writing telemetry to `git notes` (`refs/notes/ticket-events`) in non-blocking mode.
   - Prefer immutable per-event note anchors (no `HEAD` dependency) to avoid repeatedly rewriting a single large note payload.
2. Keep canonical write behavior unchanged.
3. If notes are unavailable, mirror to fallback event ref/branch.

Recommended `.tickets/config.yml` block:
```yaml
telemetry:
  backend: notes
  notes_ref: refs/notes/ticket-events
  event_ref: refs/tickets/events
  write_fallback: true
  read_fallback: true
```

Optional runtime overrides:
- `TICKET_TELEMETRY_BACKEND`
- `TICKET_TELEMETRY_NOTES_REF`
- `TICKET_TELEMETRY_EVENT_REF`
- `TICKET_TELEMETRY_WRITE_FALLBACK`
- `TICKET_TELEMETRY_READ_FALLBACK`

Verification commands:
```bash
# List available notes refs
git for-each-ref refs/notes

# Inspect stored note entries
git notes --ref refs/notes/ticket-events list

# Validate canonical still independent
ticket validate --ci
```

Exit criteria:
- Telemetry writes occur without changing canonical correctness.
- Canonical workflows continue working for users who do not read telemetry.

### Phase 2: Reader adoption + operational policy

1. Add telemetry readers with precedence:
   - read notes first
   - then fallback event ref
2. Keep readers best-effort; failures degrade to canonical-only behavior.
3. Define retention + compaction policy.

Verification commands:
```bash
# Canonical determinism check
rm -f .tickets/index.json
ticket rebuild-index
ticket validate --ci

# Optional: compare telemetry availability across stores
git notes --ref refs/notes/ticket-events list
```

Exit criteria:
- Canonical rebuild remains deterministic without telemetry.
- Telemetry read failures do not block ticket operations.

### Phase 2.5: Backfill compaction snapshots

Use the compaction command to collapse noisy historical telemetry into compact snapshots.

Commands:
```bash
# Preview only (non-destructive)
ticket events compact

# Explicit write mode
ticket events compact --apply
```

Verification commands:
```bash
ticket validate --ci
git notes --ref refs/notes/ticket-events list
git show refs/tickets/events
```

Rollback instructions:
- The `--apply` command prints backup refs under `refs/tickets/backups/*`.
- Restore using:
```bash
git update-ref refs/notes/ticket-events <printed-notes-backup-ref>
git update-ref refs/tickets/events <printed-event-backup-ref>
```

### Phase 3: CI tier rollout

1. Set hard integrity checks as required.
2. Configure quality checks as warnings.
3. Enable strict mode only for selected repos/branches.

Suggested policy matrix:
- Required: protocol/schema/index/state integrity
- Warning: quality heuristics, optional metadata hygiene
- Opt-in strict: stronger governance gates

CLI/config controls:
- Config: `.tickets/config.yml` -> `policy.tier: integrity|warn|quality|opt-in|strict|hard`
- Env override: `TICKET_POLICY_TIER`
- Per-run override: `ticket validate --ci --policy-tier <tier>`

Exit criteria:
- Existing repositories pass default CI without new breaking requirements.
- Strict mode is explicit and documented.

## 4. Rollback Plan

Rollback is lane-local and low-risk because canonical lane is unchanged.

If telemetry lane causes issues:
1. Stop telemetry writers.
2. Keep canonical workflow running.
3. Optionally archive or ignore telemetry refs.

Rollback commands:
```bash
# Disable notes usage operationally (tooling/config dependent)
# Then confirm canonical operations still pass:
ticket validate --ci
ticket rebuild-index

# Optional: remove local notes ref copy (do not force remote deletion unless intentional)
git update-ref -d refs/notes/ticket-events || true
```

Success condition:
- Repo continues to function using canonical files only.

## 5. Verification Runbook

Run after each migration phase:

```bash
# 1) Canonical integrity
ticket validate --ci

# 2) Canonical rebuild determinism
rm -f .tickets/index.json
ticket rebuild-index
ticket validate --ci

# 3) Git cleanliness for canonical changes
git status --short .tickets
```

Optional telemetry checks:
```bash
git for-each-ref refs/notes
git log --show-notes=ticket-events -n 10
```

## 6. Acceptance Checklist

- [ ] Canonical lane remains default source of truth on main
- [ ] Telemetry lane enabled outside canonical history
- [ ] Notes-first storage policy documented
- [ ] Event-ref fallback documented and tested
- [ ] Backfill compaction tooling exercised in dry-run and apply modes
- [ ] Deterministic rebuild proven from canonical files alone
- [ ] CI tiers configured: hard fail, warn quality, opt-in strict
- [ ] Rollback tested and documented

## 7. Risk Register

| Risk | Trigger | Effect | Mitigation |
|---|---|---|---|
| Notes not replicated consistently | clone/fetch defaults | Partial telemetry visibility | Document fetch policy and keep fallback ref |
| Fallback ref grows unbounded | no compaction/retention | Repo/storage bloat | Add compaction tooling and retention windows |
| Telemetry parser errors | malformed events | noisy failures | Make telemetry lane best-effort, never canonical-blocking |
| CI strict mode enabled globally | config drift | accidental adoption breakage | Keep strict mode opt-in and branch-scoped |
| Teams infer state from telemetry | UX ambiguity | wrong operational decisions | Label telemetry as non-authoritative in docs/UI |

## 8. Follow-on TODO Hooks

- `TK-01KHWGYACV`: implement robust notes writer/reader + fallback ref sync
- `TK-01KHWGYAM6`: add `ticket events` and compaction commands
- `TK-01KHWGYAVF`: ship tiered CI policy presets and strict-mode toggle
