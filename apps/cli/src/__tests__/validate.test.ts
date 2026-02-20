import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runValidate } from "../commands/validate.js";
import { EXIT_CODE, TicketError } from "../lib/errors.js";
import { rebuildIndex } from "../lib/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

async function mkTempRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ticket-validate-test-"));
  tempDirs.push(dir);
  await fs.mkdir(path.join(dir, ".tickets/tickets"), { recursive: true });
  return dir;
}

async function writeTicket(cwd: string, id: string, contents: string): Promise<void> {
  const file = path.join(cwd, ".tickets/tickets", `${id}.md`);
  await fs.writeFile(file, contents, "utf8");
}

describe("validate command", () => {
  it("passes for valid tickets and fresh index", async () => {
    const cwd = await mkTempRepo();
    const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
    await writeTicket(
      cwd,
      id,
      `---
id: ${id}
title: Valid ticket
state: ready
priority: p1
labels: [bug]
created: 2026-02-16T00:00:00.000Z
updated: 2026-02-16T00:00:00.000Z
---
`
    );
    await rebuildIndex(cwd);

    await expect(runValidate(cwd, {})).resolves.toBeUndefined();
  });

  it("reports schema and stale index errors", async () => {
    const cwd = await mkTempRepo();
    const id = "NOT-A-ULID";
    await writeTicket(
      cwd,
      id,
      `---
id: ${id}
title: Bad ticket
state: nope
priority: p9
labels: bad
created: 2026-02-16T00:00:00.000Z
---
`
    );

    let error: unknown;
    try {
      await runValidate(cwd, {});
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(TicketError);
    const ticketError = error as TicketError;
    expect(ticketError.exitCode).toBe(EXIT_CODE.VALIDATION_FAILED);
    expect(ticketError.message).toContain("Validation failed");
    expect(ticketError.message).toContain("filename must be a valid ULID");
    expect(ticketError.message).toContain("invalid state 'nope'");
    expect(ticketError.message).toContain("invalid priority 'p9'");
    expect(ticketError.message).toContain("labels must be an array of strings");
    expect(ticketError.message).toContain("index.json is missing, invalid, or stale");
  });

  it("regenerates stale index with --fix", async () => {
    const cwd = await mkTempRepo();
    const id = "01ARZ3NDEKTSV4RRFFQ69G5FAB";
    await writeTicket(
      cwd,
      id,
      `---
id: ${id}
title: Needs fix
state: backlog
priority: p2
labels: []
---
`
    );

    await runValidate(cwd, { fix: true, ci: true });

    const indexRaw = await fs.readFile(path.join(cwd, ".tickets/index.json"), "utf8");
    const index = JSON.parse(indexRaw) as { tickets: Array<{ id: string }> };
    expect(index.tickets.map((ticket) => ticket.id)).toContain(id);
  });

  it("fails when frontmatter delimiters are not exact --- lines", async () => {
    const cwd = await mkTempRepo();
    const id = "01ARZ3NDEKTSV4RRFFQ69G5FAC";
    await writeTicket(
      cwd,
      id,
      `--- 
id: ${id}
title: Bad delimiter
state: backlog
priority: p1
labels: []
---
`
    );

    await expect(runValidate(cwd, {})).rejects.toThrow("frontmatter must begin on line 1 and be delimited by exact '---' lines");
  });

  it("fails when closing delimiter is not exact ---", async () => {
    const cwd = await mkTempRepo();
    const id = "01ARZ3NDEKTSV4RRFFQ69G5FAK";
    await writeTicket(
      cwd,
      id,
      `---
id: ${id}
title: Bad closing delimiter
state: backlog
priority: p1
labels: []
--- 
`
    );

    await expect(runValidate(cwd, {})).rejects.toThrow("frontmatter must begin on line 1 and be delimited by exact '---' lines");
  });

  it("fails when required keys are missing", async () => {
    const cwd = await mkTempRepo();
    const id = "01ARZ3NDEKTSV4RRFFQ69G5FAD";
    await writeTicket(
      cwd,
      id,
      `---
id: ${id}
title: Missing fields
state: backlog
---
`
    );

    await expect(runValidate(cwd, {})).rejects.toThrow("missing required key 'priority'");
    await expect(runValidate(cwd, {})).rejects.toThrow("missing required key 'labels'");
  });

  it("fails when frontmatter id does not match filename stem exactly", async () => {
    const cwd = await mkTempRepo();
    const id = "01ARZ3NDEKTSV4RRFFQ69G5FAE";
    await writeTicket(
      cwd,
      id,
      `---
id: 01ARZ3NDEKTSV4RRFFQ69G5FAF
title: Wrong id
state: backlog
priority: p1
labels: []
---
`
    );

    await expect(runValidate(cwd, {})).rejects.toThrow("id must match filename");
  });

  it("fails when enums are not exact lowercase values", async () => {
    const cwd = await mkTempRepo();
    const id = "01ARZ3NDEKTSV4RRFFQ69G5FAG";
    await writeTicket(
      cwd,
      id,
      `---
id: ${id}
title: Enum case
state: Ready
priority: P1
labels: []
---
`
    );

    await expect(runValidate(cwd, {})).rejects.toThrow("invalid state 'Ready'");
    await expect(runValidate(cwd, {})).rejects.toThrow("invalid priority 'P1'");
  });

  it("fails when labels is not an array", async () => {
    const cwd = await mkTempRepo();
    const id = "01ARZ3NDEKTSV4RRFFQ69G5FAH";
    await writeTicket(
      cwd,
      id,
      `---
id: ${id}
title: Labels type
state: backlog
priority: p1
labels: bug
---
`
    );

    await expect(runValidate(cwd, {})).rejects.toThrow("labels must be an array of strings");
  });

  it("fails when YAML frontmatter contains tab characters", async () => {
    const cwd = await mkTempRepo();
    const id = "01ARZ3NDEKTSV4RRFFQ69G5FAL";
    await writeTicket(
      cwd,
      id,
      `---
id: ${id}
title:\tTabbed
state: backlog
priority: p1
labels: []
---
`
    );

    await expect(runValidate(cwd, {})).rejects.toThrow("YAML frontmatter must not contain tab characters");
  });

  it("fails when assignee/reviewer are present but invalid", async () => {
    const cwd = await mkTempRepo();
    const id = "01ARZ3NDEKTSV4RRFFQ69G5FAJ";
    await writeTicket(
      cwd,
      id,
      `---
id: ${id}
title: Actor fields
state: ready
priority: p1
labels: []
assignee: ""
reviewer: 123
---
`
    );

    await expect(runValidate(cwd, {})).rejects.toThrow("assignee must match 'human:<slug>' or 'agent:<slug>'");
    await expect(runValidate(cwd, {})).rejects.toThrow("reviewer must match 'human:<slug>' or 'agent:<slug>'");
  });

  it("defaults to integrity tier (quality checks disabled)", async () => {
    const cwd = await mkTempRepo();
    const id = "01ARZ3NDEKTSV4RRFFQ69G5FAM";
    await writeTicket(
      cwd,
      id,
      `---
id: ${id}
title: Minimal
state: backlog
priority: p1
labels: []
---
`
    );
    await rebuildIndex(cwd);

    await expect(runValidate(cwd, {})).resolves.toBeUndefined();
  });

  it("warn tier surfaces quality findings without failing", async () => {
    const cwd = await mkTempRepo();
    const id = "01ARZ3NDEKTSV4RRFFQ69G5FAN";
    await writeTicket(
      cwd,
      id,
      `---
id: ${id}
title: Minimal
state: backlog
priority: p1
labels: []
---
`
    );
    await rebuildIndex(cwd);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(runValidate(cwd, { policyTier: "warn" })).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("missing checklist items under 'Acceptance Criteria'"));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("weak or missing 'Problem' section content"));
  });

  it("quality tier promotes quality findings to failures", async () => {
    const cwd = await mkTempRepo();
    const id = "01ARZ3NDEKTSV4RRFFQ69G5FAP";
    await writeTicket(
      cwd,
      id,
      `---
id: ${id}
title: Minimal
state: backlog
priority: p1
labels: []
---
`
    );
    await rebuildIndex(cwd);

    await expect(runValidate(cwd, { policyTier: "quality" })).rejects.toThrow("missing checklist items under 'Acceptance Criteria'");
  });

  it("strict tier fails when strict checks are missing", async () => {
    const cwd = await mkTempRepo();
    const id = "01ARZ3NDEKTSV4RRFFQ69G5FAQ";
    await writeTicket(
      cwd,
      id,
      `---
id: ${id}
title: Structured
state: ready
priority: p1
labels: []
---
## Problem

Enough detail to satisfy quality checks.

## Acceptance Criteria

- [ ] Something concrete

## Spec

Enough detail to satisfy quality checks.
`
    );
    await rebuildIndex(cwd);

    await expect(runValidate(cwd, { policyTier: "strict" })).rejects.toThrow("strict tier requires assignee");
    await expect(runValidate(cwd, { policyTier: "strict" })).rejects.toThrow("strict tier requires reviewer");
  });
});
