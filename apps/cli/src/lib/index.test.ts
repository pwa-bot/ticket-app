import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { rebuildIndex } from "./index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

async function mkTempRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ticket-index-test-"));
  tempDirs.push(dir);
  await fs.mkdir(path.join(dir, ".tickets/tickets"), { recursive: true });
  return dir;
}

async function writeTicket(cwd: string, id: string, title: string, state: string, priority: string, created?: string): Promise<void> {
  const file = path.join(cwd, ".tickets/tickets", `${id}.md`);
  const createdBlock = created ? `created: ${created}\n` : "";
  const contents = `---\nid: ${id}\ntitle: ${title}\nstate: ${state}\npriority: ${priority}\nlabels: []\n${createdBlock}---\n`;
  await fs.writeFile(file, contents, "utf8");
}

describe("rebuildIndex", () => {
  it("sorts by priority, then created date, then id", async () => {
    const cwd = await mkTempRepo();

    await writeTicket(cwd, "01ARZ3NDEKTSV4RRFFQ69G5FAB", "B", "backlog", "p2", "2026-02-16T00:00:00.000Z");
    await writeTicket(cwd, "01ARZ3NDEKTSV4RRFFQ69G5FAC", "C", "backlog", "p1", "2026-02-17T00:00:00.000Z");
    await writeTicket(cwd, "01ARZ3NDEKTSV4RRFFQ69G5FAA", "A", "done", "p1", "2026-02-16T00:00:00.000Z");
    await writeTicket(cwd, "01ARZ3NDEKTSV4RRFFQ69G5FAD", "D", "ready", "p3", "2026-02-15T00:00:00.000Z");

    const index = await rebuildIndex(cwd);

    expect(index.tickets.map((ticket) => ticket.id)).toEqual([
      "01ARZ3NDEKTSV4RRFFQ69G5FAA",
      "01ARZ3NDEKTSV4RRFFQ69G5FAC",
      "01ARZ3NDEKTSV4RRFFQ69G5FAB",
      "01ARZ3NDEKTSV4RRFFQ69G5FAD"
    ]);
  });
});
