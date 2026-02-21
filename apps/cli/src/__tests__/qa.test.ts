import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import matter from "gray-matter";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runDone } from "../commands/move.js";
import { runQaFail, runQaPass, runQaReady, runQaReset } from "../commands/qa.js";
import { EXIT_CODE, TicketError } from "../lib/errors.js";
import { rebuildIndex } from "../lib/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

async function mkTempRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ticket-qa-test-"));
  tempDirs.push(dir);
  await fs.mkdir(path.join(dir, ".tickets/tickets"), { recursive: true });
  return dir;
}

function qaBody(includeChecklist: boolean = true): string {
  if (!includeChecklist) {
    return `## Problem

Description

## Acceptance Criteria

- [ ] Works

## Spec

Details
`;
  }
  return `## Problem

Description

## Acceptance Criteria

- [ ] Works

## Spec

Details

## QA

### Test Steps
1. Do thing

### Expected Results
- Works

### Risk Notes
- Low

### Rollback Notes
- Revert

### Observed Results
- Pending

### Environment
- staging

### Pass/Fail Decision
- Pending
`;
}

async function writeTicket(cwd: string, id: string, state: string = "in_progress", body: string = qaBody()): Promise<void> {
  const file = path.join(cwd, ".tickets/tickets", `${id}.md`);
  const contents = `---
id: ${id}
title: QA flow ticket
state: ${state}
priority: p1
labels: []
---
${body}
`;
  await fs.writeFile(file, contents, "utf8");
}

async function readTicket(cwd: string, id: string): Promise<matter.GrayMatterFile<string>> {
  const file = path.join(cwd, ".tickets/tickets", `${id}.md`);
  return matter(await fs.readFile(file, "utf8"));
}

describe("qa signaling commands", () => {
  it("supports ready -> fail -> reset -> pass transitions", async () => {
    const cwd = await mkTempRepo();
    const id = "01ARZ3NDEKTSV4RRFFQ69G5QAA";
    await writeTicket(cwd, id);
    await rebuildIndex(cwd);

    await runQaReady(cwd, id, { ci: true, env: "staging@abc123" });
    let parsed = await readTicket(cwd, id);
    expect(parsed.data.x_ticket.qa.required).toBe(true);
    expect(parsed.data.x_ticket.qa.status).toBe("ready_for_qa");
    expect(parsed.data.x_ticket.qa.environment).toBe("staging@abc123");

    await runQaFail(cwd, id, { ci: true, reason: "regression in checkout flow" });
    parsed = await readTicket(cwd, id);
    expect(parsed.data.x_ticket.qa.status).toBe("qa_failed");
    expect(parsed.data.x_ticket.qa.status_reason).toBe("regression in checkout flow");

    await runQaReset(cwd, id, { ci: true });
    parsed = await readTicket(cwd, id);
    expect(parsed.data.x_ticket.qa.status).toBe("pending_impl");
    expect(parsed.data.x_ticket.qa.status_reason).toBeUndefined();

    await runQaPass(cwd, id, { ci: true, env: "staging@def456" });
    parsed = await readTicket(cwd, id);
    expect(parsed.data.x_ticket.qa.status).toBe("qa_passed");
    expect(parsed.data.x_ticket.qa.environment).toBe("staging@def456");
  });

  it("blocks qa ready when required QA checklist headings are missing", async () => {
    const cwd = await mkTempRepo();
    const id = "01ARZ3NDEKTSV4RRFFQ69G5QAB";
    await writeTicket(cwd, id, "in_progress", qaBody(false));
    await rebuildIndex(cwd);

    await expect(runQaReady(cwd, id, { ci: true, env: "staging" })).rejects.toThrow(
      "missing required `## QA` section"
    );
  });

  it("enforces done gate when qa is required and not passed", async () => {
    const cwd = await mkTempRepo();
    const id = "01ARZ3NDEKTSV4RRFFQ69G5QAC";
    await writeTicket(cwd, id);
    await rebuildIndex(cwd);
    await runQaReady(cwd, id, { ci: true, env: "staging" });

    let error: unknown;
    try {
      await runDone(cwd, id, { ci: true });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(TicketError);
    const ticketError = error as TicketError;
    expect(ticketError.exitCode).toBe(EXIT_CODE.INVALID_TRANSITION);
    expect(ticketError.message).toContain("requires x_ticket.qa.status=qa_passed");
  });

  it("allows done after qa pass", async () => {
    const cwd = await mkTempRepo();
    const id = "01ARZ3NDEKTSV4RRFFQ69G5QAD";
    await writeTicket(cwd, id);
    await rebuildIndex(cwd);
    await runQaPass(cwd, id, { ci: true, env: "staging" });

    await expect(runDone(cwd, id, { ci: true })).resolves.toBeUndefined();
    const parsed = await readTicket(cwd, id);
    expect(parsed.data.state).toBe("done");
  });
});
