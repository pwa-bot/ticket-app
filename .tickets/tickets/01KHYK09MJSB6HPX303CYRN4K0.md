---
id: 01KHYK09MJSB6HPX303CYRN4K0
title: Process Define QA handoff rules and ticket surfacing conventions
state: done
priority: p1
labels:
  - process
  - qa
  - workflow
---

## Problem

QA handoff is inconsistent today: sometimes implementation is "done" but it's unclear whether Morgan should verify, what exactly to verify, and where that status is represented. This causes stalls, repeated pings, and ambiguity in automation.

## Goal

Define a single QA signaling contract that is visible in:
1) ticket markdown/spec,
2) ticket CLI UX,
3) skill/automation behavior,
so humans and agents have one shared truth for "ready for QA", "QA blocked", and "QA passed/failed".

## Scope

**In:**
- QA state vocabulary + transitions
- Required QA checklist fields per ticket
- How agents mark QA-needed vs implementation-done
- How failed QA feeds back into ticket workflow
- Surfacing rules in ticket CLI + skill guidance

**Out:**
- Full E2E test framework redesign
- External PM integrations
- Historical ticket migration beyond minimal backfill

## Acceptance Criteria

- [ ] A canonical QA signaling contract is documented (states, transitions, required fields).
- [ ] Ticket template/spec includes a mandatory **QA section** with:
  - test steps
  - expected results
  - risk notes
  - rollback notes (if applicable)
- [ ] CLI behavior is defined for at least:
  - mark "ready_for_qa"
  - mark "qa_failed" (with reason)
  - mark "qa_passed"
- [ ] Agent skill/automation rules define when to request QA and how to phrase/status it.
- [ ] "Done" is explicitly blocked until QA pass when ticket has QA-required flag.
- [ ] At least 2 real tickets are run through the new process as validation.

## QA Signaling v1 (proposed)

### States
- backlog
- ready
- in_progress
- review
- **ready_for_qa**
- **qa_failed**
- done

### Transition rules
- Implementation complete -> ready_for_qa (requires QA checklist filled)
- ready_for_qa -> done (only after explicit qa_passed event/comment)
- ready_for_qa -> qa_failed (if QA finds issue)
- qa_failed -> in_progress (agent fixes) -> ready_for_qa

### Required QA payload (ticket body)
- **QA Steps:** numbered manual verification steps
- **Expected:** exact expected outcomes
- **Observed:** (filled by QA)
- **Environment:** prod/staging/local + build/version
- **Pass/Fail Decision:** explicit

### Agent messaging contract
When agent requests QA, response must include:
1) "QA READY" marker
2) ticket ID
3) exact steps
4) risk area callouts
5) what evidence to capture if fail

## Linked Execution Tickets
- TK-01KHYK25 (spec/markdown contract)
- TK-01KHYK25-2 (CLI surfacing + transitions)
- TK-01KHYK26 (skill/automation integration)

## Notes

This ticket is the orchestration/process umbrella. Implementation should be split across linked tickets and then validated end-to-end on active backlog work.
