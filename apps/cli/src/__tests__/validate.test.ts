import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import matter from "gray-matter";
import { afterEach, describe, expect, it } from "vitest";
import { runValidate } from "../commands/validate.js";
import { rebuildIndex } from "../lib/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
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

    await expect(runValidate(cwd, {})).rejects.toThrow("Validation failed");
    await expect(runValidate(cwd, {})).rejects.toThrow("filename must be a valid ULID");
    await expect(runValidate(cwd, {})).rejects.toThrow("invalid state 'nope'");
    await expect(runValidate(cwd, {})).rejects.toThrow("invalid priority 'p9'");
    await expect(runValidate(cwd, {})).rejects.toThrow("labels must be an array of strings");
    await expect(runValidate(cwd, {})).rejects.toThrow("missing required field 'updated'");
    await expect(runValidate(cwd, {})).rejects.toThrow("index.json is missing, invalid, or stale");
  });

  it("fixes missing updated timestamp and regenerates stale index", async () => {
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
created: 2026-02-16T00:00:00.000Z
---
`
    );

    await runValidate(cwd, { fix: true, ci: true });

    const markdown = await fs.readFile(path.join(cwd, ".tickets/tickets", `${id}.md`), "utf8");
    const parsed = matter(markdown);
    expect(typeof parsed.data.updated).toBe("string");

    const indexRaw = await fs.readFile(path.join(cwd, ".tickets/index.json"), "utf8");
    const index = JSON.parse(indexRaw) as { tickets: Array<{ id: string }> };
    expect(index.tickets.map((ticket) => ticket.id)).toContain(id);
  });
});
