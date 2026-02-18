# Governance

This document describes how the Ticket Protocol and its reference implementations evolve.

Ticket is protocol-first. The protocol is the interoperability contract. Implementations follow the protocol, not the other way around.

---

## Components and ownership

### Ticket Protocol

- Purpose: define file format and repository structure for machine-readable work stored in Git.
- License: CC0 (public domain).
- Scope: format and rules only, not product features.

### Reference implementations

- CLI, validator, GitHub Action, dashboard overlay.
- Purpose: prove the protocol and make it usable.
- Scope: may evolve faster than the protocol.

---

## Decision principles

1) **Stability beats features**

The protocol should change slowly and remain easy to implement.

2) **Additive by default**

Prefer changes that do not break existing repositories or tools.

3) **Implementation-agnostic**

The protocol must not require a server, database, or a specific platform.

4) **Git remains authoritative**

Any derived caches or indexes are disposable. Ticket files win.

---

## Roles

- **Protocol Maintainers**
  - Approve protocol changes and releases.
  - Ensure interoperability and minimal scope.

- **Implementation Maintainers**
  - Approve changes to CLI and tooling.
  - Ensure compliance with the protocol.

In early stages, the project owner(s) act as both.

---

## How protocol changes happen

### 1) Proposals

Any non-trivial protocol change should begin as a short proposal:

- motivation
- exact spec changes
- compatibility impact
- migration plan if needed
- alternatives considered

Proposals can be:
- a GitHub issue labeled `protocol`
- or a PR marked `draft`

### 2) Review bar for protocol PRs

Protocol PRs must:
- stay within protocol scope (format and rules)
- remain implementation-agnostic
- be easy to implement
- preserve forward compatibility
- include updated examples (and schemas if applicable)

Protocol PRs must not:
- add business model, pricing, or product roadmap
- add platform-specific requirements
- introduce a database requirement

### 3) Approval rules

- Protocol PRs require approval from a Protocol Maintainer.
- Breaking changes require explicit approval from all Protocol Maintainers.

If there is disagreement:
- prefer the smallest change
- defer optional features to `x_ticket`
- or reject the change until a stronger justification exists

---

## Versioning

### Protocol version (vMAJOR.MINOR.PATCH)

- **MAJOR**: breaking changes or new conformance requirements
- **MINOR**: new optional fields, clarifications, non-breaking additions
- **PATCH**: typos, formatting, non-behavioral clarifications

### format_version (on-disk schema)

- Increment `format_version` only when the on-disk schema changes in a breaking way.
- Additive optional fields do not require a `format_version` bump.

---

## Backward and forward compatibility

### Backward compatibility

- Existing ticket files must remain valid unless the major protocol version changes.
- Avoid changes that require mass migration.

### Forward compatibility

Implementations must:
- ignore unknown fields when processing
- preserve unknown fields semantically on rewrite
- preserve `x_ticket` semantically on rewrite

This allows older tools to coexist with newer extensions.

---

## Release process

### Protocol releases

1) Merge approved changes.
2) Update changelog and version header.
3) Tag release `protocol-vX.Y.Z`.
4) Publish schemas/examples matching that version.

### Implementation releases

Implementation releases may happen more frequently. They must:
- remain compliant with the current protocol
- clearly document any experimental behavior
- avoid introducing behavior that implies protocol changes without updating the protocol

---

## Security and privacy

The protocol is designed for Git repositories. Therefore:

- ticket files must not contain secrets (tokens, API keys, passwords)
- implementations that render Markdown in a browser must sanitize it
- do not include PII in public examples or issues

Security issues should be reported privately if needed.

---

## Scope boundaries

The protocol will not expand into:

- helpdesk workflows and support transcripts
- custom workflow engines beyond the defined states (v1)
- database-required semantics
- per-seat assumptions

These can exist as product features, but not as protocol requirements.

---

## Contact

For protocol questions:
- open a GitHub issue labeled `protocol`
- or start a draft PR with a proposal section
