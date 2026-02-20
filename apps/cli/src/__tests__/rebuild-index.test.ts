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

  it("repairs legacy duplicate display ids during rebuild (migration/backfill)", async () => {
    const cwd = await mkTempRepo();
    const id1 = "01KHWGYA000000000000000000";
    const id2 = "01KHWGYA000000000000000001";
    const id3 = "01KHWGYA000000000000000002";

    await writeTicket(cwd, id1, "first", "backlog", "p1");
    await writeTicket(cwd, id2, "second", "ready", "p1");
    await writeTicket(cwd, id3, "third", "done", "p1");

    const legacyIndex = {
      format_version: 1,
      generated_at: "2026-02-20T00:00:00.000Z",
      workflow: "simple-v1",
      tickets: [
        { id: id1, short_id: "01KHWGYA", display_id: "TK-01KHWGYA", title: "first", state: "backlog", priority: "p1", labels: [], path: `.tickets/tickets/${id1}.md` },
        { id: id2, short_id: "01KHWGYA", display_id: "TK-01KHWGYA", title: "second", state: "ready", priority: "p1", labels: [], path: `.tickets/tickets/${id2}.md` },
        { id: id3, short_id: "01KHWGYA", display_id: "TK-01KHWGYA", title: "third", state: "done", priority: "p1", labels: [], path: `.tickets/tickets/${id3}.md` }
      ]
    };
    await fs.writeFile(path.join(cwd, ".tickets/index.json"), `${JSON.stringify(legacyIndex, null, 2)}\n`, "utf8");

    await runRebuildIndex(cwd);

    const rebuilt = JSON.parse(await fs.readFile(path.join(cwd, ".tickets/index.json"), "utf8")) as {
      tickets: Array<{ id: string; display_id: string }>;
    };
    const byId = new Map(rebuilt.tickets.map((ticket) => [ticket.id, ticket.display_id]));
    expect(byId.get(id1)).toBe("TK-01KHWGYA");
    expect(byId.get(id2)).toBe("TK-01KHWGYA-2");
    expect(byId.get(id3)).toBe("TK-01KHWGYA-3");
  });
});
