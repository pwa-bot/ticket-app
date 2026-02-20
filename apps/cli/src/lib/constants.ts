export const TICKETS_ROOT = ".tickets";
export const TICKETS_DIR = ".tickets/tickets";
export const CONFIG_PATH = ".tickets/config.yml";
export const TEMPLATE_PATH = ".tickets/template.md";
export const TEMPLATES_DIR = ".tickets/templates";
export const INDEX_PATH = ".tickets/index.json";

export const DEFAULT_CONFIG = `format_version: 1
id_prefix: TK
directory: .tickets/tickets
workflow: simple-v1

linking:
  branch_pattern: "tk-{short_id}-{slug}"
  pr_title_pattern: "[{display_id}] {title}"

policy:
  tier: integrity

telemetry:
  backend: off
  notes_ref: refs/notes/ticket-events
  event_ref: refs/tickets/events
  write_fallback: true
  read_fallback: true
`;

export const DEFAULT_TEMPLATE = `---
id: {{id}}
title: {{title}}
state: {{state}}
priority: {{priority}}
labels: []
---

## Problem

Describe the problem and context.

## Acceptance Criteria

- [ ] 

## Spec

Keep small specs inline. Link longer docs if needed.

## Notes

Any extra context, links, screenshots.
`;

export const BUILTIN_TEMPLATES = {
  bug: `---
id: {{id}}
title: {{title}}
state: {{state}}
priority: {{priority}}
template: bug
labels:
  - bug
---

## Summary

Clear description of the bug.

## Steps To Reproduce

1. 
2. 
3. 

## Expected

What should happen.

## Actual

What happens instead.

## Acceptance Criteria

- [ ] Repro is confirmed
- [ ] Root cause is fixed
- [ ] Regression risk checked
`,
  feature: `---
id: {{id}}
title: {{title}}
state: {{state}}
priority: {{priority}}
template: feature
labels:
  - feature
---

## Problem

What user or business problem are we solving?

## Proposed Solution

Describe the approach.

## Acceptance Criteria

- [ ] 

## Notes

Dependencies, rollout, edge cases.
`,
  chore: `---
id: {{id}}
title: {{title}}
state: {{state}}
priority: {{priority}}
template: chore
labels:
  - chore
---

## Goal

Describe the maintenance / infrastructure work.

## Scope

- In scope:
- Out of scope:

## Acceptance Criteria

- [ ] 

## Notes

Operational details and follow-up work.
`,
} as const;

export const BUILTIN_TEMPLATE_NAMES = Object.keys(BUILTIN_TEMPLATES) as Array<keyof typeof BUILTIN_TEMPLATES>;

export const DEFAULT_INDEX = {
  format_version: 1,
  generated_at: new Date(0).toISOString(),
  workflow: "simple-v1",
  tickets: []
};

export const STATE_ORDER = ["backlog", "ready", "in_progress", "blocked", "done"] as const;
export const PRIORITY_ORDER = ["p0", "p1", "p2", "p3"] as const;

export type TicketState = (typeof STATE_ORDER)[number];
export type TicketPriority = (typeof PRIORITY_ORDER)[number];
