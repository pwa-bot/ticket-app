# QA Handoff Contract v1

Status: Active process contract  
Scope: Process/workflow definition for repositories using `workflow: simple-v1`

## 1. Purpose

Define one shared QA signaling contract across:
- Ticket markdown shape
- Ticket CLI behavior
- Agent handoff messaging

This contract is process-level and additive. It does not change the protocol v1 state enum.

## 2. Canonical QA Signal Model

## 2.1 Compatibility rule

Protocol `state` remains one of:
- `backlog`
- `ready`
- `in_progress`
- `blocked`
- `done`

QA lifecycle is tracked in `x_ticket.qa` to avoid breaking protocol compatibility.

## 2.2 Required frontmatter fields

```yaml
x_ticket:
  qa:
    required: true
    status: pending_impl
```

When `x_ticket.qa.required: true`, these rules apply:
- `x_ticket.qa.status` is REQUIRED and MUST be one of:
  - `pending_impl`
  - `ready_for_qa`
  - `qa_failed`
  - `qa_passed`
- `x_ticket.qa.status_reason` is REQUIRED when status is `qa_failed`
- `x_ticket.qa.environment` is REQUIRED when status is `ready_for_qa` or `qa_passed`
- `state: done` is NOT allowed unless `x_ticket.qa.status: qa_passed`

When `x_ticket.qa.required: false` or absent:
- QA status fields are optional.
- Existing simple-v1 done flow is unchanged.

## 2.3 State + QA transition contract

1. Implementation start:
   - `state: in_progress`
   - `x_ticket.qa.status: pending_impl`
2. QA handoff:
   - keep `state: in_progress`
   - set `x_ticket.qa.status: ready_for_qa`
3. QA fail:
   - keep `state: in_progress`
   - set `x_ticket.qa.status: qa_failed`
   - set `x_ticket.qa.status_reason`
4. Rework after fail:
   - keep `state: in_progress`
   - set `x_ticket.qa.status: pending_impl`
5. QA pass:
   - keep `state: in_progress`
   - set `x_ticket.qa.status: qa_passed`
6. Completion:
   - allow transition to `state: done` only after QA pass when QA is required

## 3. Required Ticket QA Section

Every ticket that requires QA MUST include this body section:

```md
## QA

### Test Steps
1.

### Expected Results
- 

### Risk Notes
- 

### Rollback Notes
- 

### Observed Results
- (filled by QA)

### Environment
- 

### Pass/Fail Decision
- 
```

Checklist requirements:
- `Test Steps`: numbered, reproducible manual flow.
- `Expected Results`: explicit observable outcomes.
- `Risk Notes`: known high-risk areas.
- `Rollback Notes`: rollback plan, or explicit `N/A` when not applicable.
- `Observed Results`: completed by QA during verification.
- `Environment`: local/staging/prod plus relevant version/build ref.
- `Pass/Fail Decision`: explicit `PASS` or `FAIL`.

## 4. CLI QA Behavior Definition

Process contract for CLI UX and automation:

1. Mark ready for QA
   - `ticket qa ready <id> --env <value>`
   - Sets `x_ticket.qa.status=ready_for_qa`
   - Requires QA checklist fields to be present in body
2. Mark QA failed
   - `ticket qa fail <id> --reason "<reason>"`
   - Sets `x_ticket.qa.status=qa_failed`
   - Stores reason in `x_ticket.qa.status_reason`
3. Mark QA passed
   - `ticket qa pass <id> --env <value>`
   - Sets `x_ticket.qa.status=qa_passed`
4. Mark rework / reset after failure
   - `ticket qa reset <id>`
   - Sets `x_ticket.qa.status=pending_impl`
5. Done gate
   - `ticket done <id>` MUST fail when `x_ticket.qa.required=true` and status is not `qa_passed`

Surfacing conventions:
- `ticket list` SHOULD surface QA status as a dedicated indicator (`QA_READY`, `QA_FAIL`, `QA_PASS`).
- `ticket list` SHOULD support filtering by QA status.
- `ticket show` SHOULD print QA checklist completeness and latest QA decision.

## 5. Agent QA Workflow Guidance

Agents MUST request QA only when:
- Acceptance criteria are implemented.
- Local checks/tests are complete.
- QA checklist fields are complete.
- `x_ticket.qa.status` is moved to `ready_for_qa`.

Required handoff message contract:

1. Include marker: `QA READY`
2. Include ticket ID
3. Include exact test steps
4. Include risk callouts
5. Include failure evidence request (what to capture)

Required failure response contract:

1. Include marker: `QA FAILED`
2. Include ticket ID
3. Include concise failure reason
4. Include observed evidence (logs/screenshots/outputs)
5. Move ticket QA status to `qa_failed`

## 6. Validation Runs (Real Tickets)

Validation run #1:
- Ticket: `TK-01KHYK25` (`.tickets/tickets/01KHYK25NRH89N01K73KR1K1CK.md`)
- Flow exercised: `pending_impl -> ready_for_qa -> qa_failed -> pending_impl -> ready_for_qa -> qa_passed`
- Result: Contract supports failure/rework loops without leaving canonical `in_progress`.

Validation run #2:
- Ticket: `TK-01KHYK25-2` (`.tickets/tickets/01KHYK25XKPWS7TG5P4WYH40HK.md`)
- Flow exercised: `pending_impl -> ready_for_qa -> qa_passed -> done`
- Result: Done gate behavior is unambiguous when `qa_required=true`.

## 7. Implementation Notes

- This contract intentionally keeps protocol state enum unchanged for compatibility.
- QA signaling is encoded via `x_ticket` extension namespace.
- Existing tools that preserve unknown frontmatter keys remain forward-compatible.
