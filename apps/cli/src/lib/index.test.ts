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

async function writeTicket(cwd: string, id: string, title: string, state: string, priority: string): Promise<void> {
  const file = path.join(cwd, ".tickets/tickets", `${id}.md`);
  const contents = `---\nid: ${id}\ntitle: ${title}\nstate: ${state}\npriority: ${priority}\nlabels: []\n---\n`;
  await fs.writeFile(file, contents, "utf8");
}

describe("rebuildIndex", () => {
  it("sorts by state, then priority, then id", async () => {
    const cwd = await mkTempRepo();

    await writeTicket(cwd, "01ARZ3NDEKTSV4RRFFQ69G5FAA", "A", "done", "p0");
    await writeTicket(cwd, "01ARZ3NDEKTSV4RRFFQ69G5FAB", "B", "backlog", "p2");
    await writeTicket(cwd, "01ARZ3NDEKTSV4RRFFQ69G5FAC", "C", "backlog", "p1");
    await writeTicket(cwd, "01ARZ3NDEKTSV4RRFFQ69G5FAD", "D", "ready", "p3");

    const index = await rebuildIndex(cwd);

    expect(index.tickets.map((ticket) => ticket.id)).toEqual([
      "01ARZ3NDEKTSV4RRFFQ69G5FAC",
      "01ARZ3NDEKTSV4RRFFQ69G5FAB",
      "01ARZ3NDEKTSV4RRFFQ69G5FAD",
      "01ARZ3NDEKTSV4RRFFQ69G5FAA"
    ]);
  });
});
