---
id: 01KHWT95ZWQX2FCQXKEVZ85AD8
title: Guardrail require explicit confirmation before spawning sub-agents
state: done
priority: p0
labels:
  - orchestration
  - reliability
---

## Problem

- Ambiguous user requests like “do what you think is best” can trigger autonomous execution in the wrong repo/task context.
- In the recent incident, orchestration behavior (including sub-agent style delegation) happened when the expected action was to create/act on a specific ticket tied to the active problem.
- This causes trust loss and wasted cycles: work starts, then gets canceled once intent is clarified.

## Goal

Make sub-agent/delegation behavior opt-in for ambiguous prompts: default to clarification or scoped ticket action unless the user explicitly authorizes autonomous delegation.

## Scope

**In:**
- Add a policy gate before spawning sub-agents/delegated coding sessions from vague intents.
- Add intent classification for phrases like “do what’s best” with context check (current repo/problem/ticket thread).
- Add a user-visible confirmation step when confidence is low.
- Add telemetry/event logging for blocked vs approved delegation attempts.

**Out:**
- Rewriting all planning logic.
- Changes to provider-level messaging transport.

## Acceptance Criteria

- [ ] Given an ambiguous instruction (e.g. “do what you think is best”), system does **not** spawn sub-agents unless an explicit delegation signal is present.
- [ ] If confidence is low, assistant replies with one concise clarification question or proposes a scoped default (ticket creation/update) instead of starting coding.
- [ ] If user explicitly says to delegate/spawn, sub-agent flow proceeds normally.
- [ ] Unit/integration tests cover: ambiguous prompt block, explicit allow path, and repo/context mismatch detection.
- [ ] Event log records guardrail decisions with reason codes.

## UX Notes

- Keep friction minimal: only gate when delegation confidence is below threshold.
- Error/guardrail copy should be direct and blame-free.
- Prefer actionable fallback: “I can create the ticket now and start implementation after your go-ahead.”

## Test Notes

- Happy path: explicit “spawn a sub-agent for X” works.
- Edge: ambiguous phrase with prior ticket context chooses ticket-first action.
- Edge: ambiguous phrase with no context asks one clarifying question.
- Edge: explicit “don’t spawn sub-agents” is respected even if task seems delegable.
