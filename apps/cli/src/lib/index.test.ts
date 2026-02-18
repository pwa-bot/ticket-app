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
  it("sorts by state, then priority, then id (deterministic ordering)", async () => {
    const cwd = await mkTempRepo();

    // Create tickets with different states and priorities
    await writeTicket(cwd, "01ARZ3NDEKTSV4RRFFQ69G5FAB", "B-backlog-p2", "backlog", "p2");
    await writeTicket(cwd, "01ARZ3NDEKTSV4RRFFQ69G5FAC", "C-backlog-p1", "backlog", "p1");
    await writeTicket(cwd, "01ARZ3NDEKTSV4RRFFQ69G5FAA", "A-done-p1", "done", "p1");
    await writeTicket(cwd, "01ARZ3NDEKTSV4RRFFQ69G5FAD", "D-ready-p3", "ready", "p3");
    await writeTicket(cwd, "01ARZ3NDEKTSV4RRFFQ69G5FAE", "E-ready-p1", "ready", "p1");

    const index = await rebuildIndex(cwd);

    // Expected order: state (backlog < ready < done), then priority (p1 < p2 < p3), then ID
    expect(index.tickets.map((ticket) => ticket.id)).toEqual([
      "01ARZ3NDEKTSV4RRFFQ69G5FAC", // backlog, p1
      "01ARZ3NDEKTSV4RRFFQ69G5FAB", // backlog, p2
      "01ARZ3NDEKTSV4RRFFQ69G5FAE", // ready, p1
      "01ARZ3NDEKTSV4RRFFQ69G5FAD", // ready, p3
      "01ARZ3NDEKTSV4RRFFQ69G5FAA"  // done, p1
    ]);
  });

  it("produces stable output across multiple runs", async () => {
    const cwd = await mkTempRepo();

    await writeTicket(cwd, "01ARZ3NDEKTSV4RRFFQ69G5FA1", "T1", "backlog", "p1");
    await writeTicket(cwd, "01ARZ3NDEKTSV4RRFFQ69G5FA2", "T2", "backlog", "p1");
    await writeTicket(cwd, "01ARZ3NDEKTSV4RRFFQ69G5FA3", "T3", "ready", "p0");

    const index1 = await rebuildIndex(cwd);
    const index2 = await rebuildIndex(cwd);

    // Order should be identical across runs (ignoring generated_at timestamp)
    expect(index1.tickets.map((t) => t.id)).toEqual(index2.tickets.map((t) => t.id));
  });
});
