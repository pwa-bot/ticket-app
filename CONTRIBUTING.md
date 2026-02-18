# Contributing

Thanks for your interest in contributing to Ticket.

Ticket is protocol-first. Git is authoritative. The hosted dashboard is an optional overlay.

This repo may contain multiple components:

- Ticket Protocol (the open standard)
- Reference CLI implementation
- Optional tooling (validator, GitHub Action)
- Hosted dashboard (may be private or limited)

Please read this before opening issues or PRs.

---

## Guiding principles

### 1) Protocol-first

The Ticket Protocol is the interoperability contract.

- The protocol defines file format and repository structure.
- Implementations should conform to the protocol.
- Protocol changes must stay minimal and durable.

### 2) Git is authoritative

Tickets live in Git. Any caches, databases, or indexes are derived and disposable.

### 3) Additive changes only (by default)

Prefer additions that preserve backward compatibility.

- Adding optional fields is usually OK.
- Breaking schema changes require `format_version` bump and strong justification.

### 4) Avoid feature creep

Ticket is not trying to become Jira or a helpdesk.

We prioritize:

- deterministic agent operation
- durable state
- simple workflows
- interoperability

---

## Where to contribute

### Protocol contributions

The protocol should stay boring and small.

✅ Good protocol PRs:
- Clarify ambiguous wording
- Add missing constraints that improve interoperability
- Add optional fields with clear rationale
- Improve examples and schemas
- Fix contradictions and formatting issues

❌ Not good protocol PRs:
- Adding product features (pricing, dashboard UX)
- GitHub-specific behavior that breaks implementation-agnostic goals
- Complex workflow engines or configurable transitions in v1
- Anything that turns the protocol into a PM suite

Protocol review bar:
- Must be implementation-agnostic
- Must be easy to implement
- Must not require a server
- Must be forward-compatible

### CLI contributions

✅ Good CLI PRs:
- Determinism and `--ci` improvements
- Better validation and error reporting
- Performance improvements for large repos
- Cross-platform fixes (macOS, Linux, Windows)
- Test coverage (unit and integration)

❌ Not good CLI PRs:
- Changing the protocol without updating the spec
- Adding interactive UX that breaks agent-safe behavior
- Adding vendor lock-in integrations without gating

---

## Development setup (example)

```bash
pnpm install
pnpm test
```

Run unit tests:

```bash
pnpm test:unit
```

Run integration tests:

```bash
pnpm test:integration
```

---

## Pull request process

1. Keep PRs small and focused.
2. Add or update tests for behavior changes.
3. Update docs if user-facing behavior changes.
4. Do not include roadmap promises or business model changes in protocol docs.

### Protocol PR checklist

* [ ] Additive, backward-compatible change (or justified breaking change)
* [ ] Examples updated
* [ ] Schemas updated (if applicable)
* [ ] Clear rationale in PR description
* [ ] No product/marketing content added to the spec

### CLI PR checklist

* [ ] Works in `--ci` mode with deterministic outputs
* [ ] JSON envelope remains stable for automation
* [ ] Exit codes and error codes remain consistent
* [ ] Tests added/updated

---

## Issue reporting

When reporting a bug, include:

* OS
* Node version (if CLI)
* CLI version
* Minimal reproduction steps
* Sample ticket file (sanitized, no secrets)

Security note:

* Do not post secrets, tokens, or sensitive data in issues.

---

## What we do not accept

* Adding helpdesk or support ticketing workflows into the protocol
* Adding per-seat pricing assumptions anywhere
* Adding requirements that make Git non-authoritative
* Adding database-required semantics to the protocol

---

## License

* Ticket Protocol is CC0 (public domain).
* Code components have their own LICENSE files where applicable.

By contributing, you agree that your contributions are licensed under the repo's LICENSE terms.
