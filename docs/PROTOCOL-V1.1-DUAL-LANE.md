# Ticket Protocol v1.1 Addendum: Dual-Lane State Model

Status: Implemented (reference CLI)  
Version: 1.1.0 (additive to v1.0.0)  
Scope: Non-breaking guidance and optional interoperability behavior

## 1. Purpose

This addendum defines a dual-lane model to prevent repository bloat from high-frequency agent activity while preserving durable, deterministic project state.

The model separates:
- Canonical lane: low-frequency, durable semantic state.
- Telemetry lane: high-frequency operational chatter and trace events.

This is additive to Protocol v1.0.0 and does not invalidate existing repositories.

## 2. Lanes

### 2.1 Canonical lane (required for durable state)

Canonical lane data lives on the default branch in `.tickets/` and is authoritative:
- `.tickets/tickets/*.md`
- `.tickets/index.json` (Indexed profile)
- `.tickets/config.yml` (Indexed profile)

Canonical lane contains durable semantic state only (ticket content, workflow state, metadata needed for interoperability).

### 2.2 Telemetry lane (optional, high-frequency)

Telemetry lane contains append-heavy event data that does not need to be committed into canonical history.

Telemetry lane entries are:
- Non-authoritative
- Rebuildable or disposable
- Intended for debugging, observability, and agent traceability

## 3. Storage Order (Recommended)

Implementations SHOULD store telemetry using this order:

1. Primary: `git notes`
2. Fallback: dedicated event refs/branch

### 3.1 Primary: git notes

Recommended notes ref:
- `refs/notes/ticket-events`

Event producers SHOULD attach notes to commits that touched `.tickets/` (or to a chosen anchor commit policy) and include machine-readable payloads.
To minimize object growth under high-frequency writes, implementations SHOULD prefer immutable per-event note anchors (for example, one anchor object per event id) instead of repeatedly appending to a single long-lived note payload.

### 3.2 Fallback: dedicated event refs/branch

When notes are unavailable, restricted, or operationally unsuitable, implementations MAY use a dedicated ref/branch, for example:
- `refs/heads/ticket-events`
- `refs/tickets/events`

Fallback storage MUST remain out of canonical mainline history.

## 4. Canonical Deterministic Rebuild Guarantee

A conforming implementation MUST be able to rebuild canonical protocol state from canonical files alone.

Guarantee definition:
- Input set: `.tickets/tickets/*.md` (+ `.tickets/config.yml` when present)
- Deterministic output: `.tickets/index.json` and equivalent queryable canonical state
- No telemetry lane dependency allowed for correctness

Operational implication:
- Loss/corruption/deletion of telemetry lane data MUST NOT prevent canonical recovery.

## 5. Compatibility and Minimality

To preserve backward compatibility:
- Existing repos with only canonical lane remain valid.
- Implementations MUST NOT require telemetry lane data for normal ticket reads/writes.
- Execution-contract fields (agent internals, run IDs, prompts, traces) remain OPTIONAL and non-normative.

This addendum intentionally keeps protocol requirements minimal.

## 6. CI Policy Tiers (Recommended)

### 6.1 Hard integrity (default required)

CI MUST fail for canonical integrity violations:
- Invalid ticket schema
- Invalid state transitions
- `id`/filename mismatch
- Corrupt or stale derived index where policy requires freshness

### 6.2 Warn quality (default non-blocking)

CI SHOULD warn (not fail) for quality signals:
- Missing acceptance criteria
- Weak ticket descriptions
- Missing optional metadata

### 6.3 Strict mode (opt-in)

CI MAY support an explicit strict mode that upgrades selected warnings to failures.

Strict mode MUST be opt-in and MUST NOT be assumed by baseline protocol conformance.

Reference CLI tier presets:
- `integrity` (default): fail integrity checks only
- `warn`: fail integrity checks, warn quality checks
- `quality`: fail integrity + quality checks
- `opt-in`: fail integrity checks, warn quality + strict checks
- `strict`: fail integrity + quality + strict checks
- `hard`: alias of strict/full hard-fail mode

## 7. Implementation Hooks (Non-normative)

Planned follow-on implementation tickets:
- `TK-01KHWGYACV`: telemetry lane write/read using notes with fallback refs
- `TK-01KHWGYAM6`: CLI event commands (append/read/compact)
- `TK-01KHWGYAVF`: CI policy tiering controls

## 8. Acceptance Checklist

- [ ] Canonical lane defined as durable and authoritative
- [ ] Telemetry lane defined as optional and non-authoritative
- [ ] Storage order documented (notes primary, event refs fallback)
- [ ] Deterministic rebuild guarantee stated from canonical files alone
- [ ] CI policy tiers documented (hard/warn/strict opt-in)
- [ ] No breaking requirements introduced for existing repos

## 9. Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Notes not fetched in default clone workflows | Missing telemetry in some environments | Provide fallback refs policy and explicit fetch docs |
| Tooling drift between notes and fallback refs | Fragmented telemetry readers | Define one canonical reader precedence and normalization |
| Teams accidentally treat telemetry as canonical | Incorrect state decisions | Document hard rule: canonical files are authoritative |
| Event growth in fallback ref | Storage/performance degradation | Add compaction tooling and retention policies |
| CI over-tightening by default | Breaks existing repos unexpectedly | Keep strict checks opt-in; preserve baseline integrity-only failures |

## 10. Changelog Entry (Proposed)

### v1.1.0 (proposed)

- Introduces dual-lane model (canonical + telemetry)
- Recommends telemetry storage order: notes first, event refs fallback
- Adds deterministic rebuild guarantee from canonical files only
- Adds CI policy tier guidance: hard integrity, warn quality, opt-in strict
- Keeps execution-contract fields optional and non-required
