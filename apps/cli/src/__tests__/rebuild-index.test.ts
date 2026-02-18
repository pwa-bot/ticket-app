import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runRebuildIndex } from "../commands/rebuild-index.js";
import { EXIT_CODE, TicketError } from "../lib/errors.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

async function mkTempRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ticket-rebuild-test-"));
  tempDirs.push(dir);
  await fs.mkdir(path.join(dir, ".tickets/tickets"), { recursive: true });
  return dir;
}

async function writeTicket(cwd: string, id: string, title: string, state: string, priority: string): Promise<void> {
  const file = path.join(cwd, ".tickets/tickets", `${id}.md`);
  const contents = `---\nid: ${id}\ntitle: ${title}\nstate: ${state}\npriority: ${priority}\nlabels: []\n---\n`;
  await fs.writeFile(file, contents, "utf8");
}

async function writeInvalidTicket(cwd: string, filename: string, contents: string): Promise<void> {
  const file = path.join(cwd, ".tickets/tickets", filename);
  await fs.writeFile(file, contents, "utf8");
}

describe("rebuild-index", () => {
  it("fails with exit 7 if any ticket is invalid", async () => {
    const cwd = await mkTempRepo();

    // Valid ticket
    await writeTicket(cwd, "01ARZ3NDEKTSV4RRFFQ69G5FAA", "Valid", "backlog", "p1");
    
    // Invalid ticket (missing required field)
    await writeInvalidTicket(cwd, "01ARZ3NDEKTSV4RRFFQ69G5FAB.md", `---
id: 01ARZ3NDEKTSV4RRFFQ69G5FAB
title: Missing State
priority: p1
labels: []
---
`);

    await expect(runRebuildIndex(cwd)).rejects.toMatchObject({
      code: "validation_failed",
      exitCode: EXIT_CODE.VALIDATION_FAILED
    });
  });

  it("reports no change when index is already current", async () => {
    const cwd = await mkTempRepo();
    await writeTicket(cwd, "01ARZ3NDEKTSV4RRFFQ69G5FAA", "Test", "backlog", "p1");

    // First rebuild creates the index
    await runRebuildIndex(cwd);
    
    // Second rebuild should detect no change
    const consoleSpy = { log: vi.spyOn(console, "log") };
    await runRebuildIndex(cwd);
    
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining("already up to date"));
    consoleSpy.log.mockRestore();
  });

  it("rebuilds index when ticket added", async () => {
    const cwd = await mkTempRepo();
    await writeTicket(cwd, "01ARZ3NDEKTSV4RRFFQ69G5FAA", "First", "backlog", "p1");
    await runRebuildIndex(cwd);

    // Add another ticket
    await writeTicket(cwd, "01ARZ3NDEKTSV4RRFFQ69G5FAB", "Second", "ready", "p2");
    
    const consoleSpy = { log: vi.spyOn(console, "log") };
    await runRebuildIndex(cwd);
    
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining("Rebuilt index with 2 tickets"));
    consoleSpy.log.mockRestore();

    // Verify index content
    const indexPath = path.join(cwd, ".tickets/index.json");
    const index = JSON.parse(await fs.readFile(indexPath, "utf8"));
    expect(index.tickets).toHaveLength(2);
  });
});
