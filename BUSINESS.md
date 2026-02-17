# BUSINESS.md - Open Source & Monetization Strategy

## Core Principle

> Open source what makes the **protocol inevitable**.
> Keep closed what is **coordination-as-a-service** (and hard to run).

---

## Open Source (MIT)

### 1. Protocol Spec
- `.tickets/` directory layout
- Ticket file format (YAML frontmatter + markdown body)
- Workflow v1 states and transitions
- `index.json` schema and sorting rules
- PR linking conventions
- Reserved namespaces (`x_ticket`, `extras`)

**Why:** This is the standard. Open builds trust and enables the ecosystem.

### 2. CLI (`ticket`)
- All commands: init, new, list, show, move, edit, branch, validate, etc.
- JSON output mode (`--json`)
- Git hooks integration
- Skill contract compliance

**Why:** Main distribution channel. Forces external discipline on determinism.

### 3. Docs & Examples
- Getting started guide
- Agent integration examples
- Git hooks templates
- GitHub Actions examples

**Why:** Reduces friction, drives adoption.

### 4. GitHub Action (Validator)
```yaml
- uses: pwa-bot/ticket-action@v1
  with:
    command: validate --all --ci
```

**Why:** Easy enforcement without hosted product. Same validator logic, different packaging.

### 5. Minimal Dashboard (Optional)
If open sourced, keep intentionally limited:
- Single repo only
- Basic board/list view
- No multi-repo portfolio
- No Slack integration
- No webhook automation
- No org features

**Why:** Builds trust without competing with paid product.

---

## Paid / Closed (Hosted Service)

### 1. Multi-Repo Portfolio ⭐ Core Wedge
- Aggregate tickets across repos
- Saved filters and views
- Shareable dashboards
- "What's ready across everything?"

**Why:** People can build it, but most won't. High value, low effort for us.

### 2. Webhook Infrastructure
- GitHub App for automated setup
- Signature verification and dedupe
- Retry logic and delivery monitoring
- Fast refresh and caching

**Why:** Operational burden. This is what people pay to avoid.

### 3. Managed Governance Checks
- GitHub App that installs check runs
- Check-run UX, annotations, reporting
- Policy management UI
- Org-level audit and enforcement

**Why:** Open source the validator logic; charge for the "managed" experience.

### 4. Slack Integration
- Notifications and digests
- Interactive buttons
- Per-org routing and rate limiting
- Template customization

**Why:** Coordination value. Classic paid feature.

### 5. Intake (Future) ⭐ Long-term Expansion
- Customer feedback widget
- Triage inbox
- PII and attachment handling
- Spam control
- Dedupe clustering
- Promotion to repo via PR

**Why:** Strongest long-term paid expansion. Requires hosted infrastructure.

---

## Licensing

**Approach: Option A (Simple & Friendly)**

| Component | License |
|-----------|---------|
| Protocol spec | MIT |
| CLI | MIT |
| Docs/examples | MIT |
| GitHub Action | MIT |
| Hosted app | Proprietary |

**Why:** Win on speed, trust, and adoption. Don't slow yourself down with complex licensing.

---

## Anti-Pattern: Don't Compete With Yourself

If you open source a full-featured dashboard, you compete with your paid product.

Keep any open dashboard intentionally limited (single-repo, no integrations).

---

## Summary

```
┌─────────────────────────────────────────────────────────┐
│                    OPEN SOURCE                          │
│  Protocol · CLI · Docs · GitHub Action · (Mini Dashboard) │
│                                                         │
│  → Makes .tickets/ the inevitable standard              │
├─────────────────────────────────────────────────────────┤
│                      PAID                               │
│  Portfolio · Webhooks · Checks · Slack · Intake         │
│                                                         │
│  → Coordination-as-a-service (hard to run yourself)    │
└─────────────────────────────────────────────────────────┘
```

**The protocol wins by being open. The business wins by being the best place to coordinate around it.**
