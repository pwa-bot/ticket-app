import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readIndex } from "./io.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

async function mkTempRepo(withTicketsRoot: boolean): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ticket-io-test-"));
  tempDirs.push(dir);
  if (withTicketsRoot) {
    await fs.mkdir(path.join(dir, ".tickets/tickets"), { recursive: true });
  }
  return dir;
}

async function writeTicket(cwd: string, id: string, priority: string, created: string): Promise<void> {
  const file = path.join(cwd, ".tickets/tickets", `${id}.md`);
  const contents = `---
id: ${id}
title: Example ${id}
state: ready
priority: ${priority}
labels: []
created: ${created}
---
`;
  await fs.writeFile(file, contents, "utf8");
}

describe("readIndex", () => {
  it("rebuilds missing index.json when tickets storage exists", async () => {
    const cwd = await mkTempRepo(true);
    await writeTicket(cwd, "01ARZ3NDEKTSV4RRFFQ69G5FAB", "p2", "2026-02-16T00:00:00.000Z");
    await writeTicket(cwd, "01ARZ3NDEKTSV4RRFFQ69G5FAA", "p1", "2026-02-15T00:00:00.000Z");

    const index = await readIndex(cwd);
    expect(index.tickets.map((ticket) => ticket.id)).toEqual([
      "01ARZ3NDEKTSV4RRFFQ69G5FAA",
      "01ARZ3NDEKTSV4RRFFQ69G5FAB"
    ]);
    await expect(fs.access(path.join(cwd, ".tickets/index.json"))).resolves.toBeUndefined();
  });

  it("rebuilds corrupt index.json when tickets storage exists", async () => {
    const cwd = await mkTempRepo(true);
    await writeTicket(cwd, "01ARZ3NDEKTSV4RRFFQ69G5FAA", "p1", "2026-02-15T00:00:00.000Z");
    await fs.writeFile(path.join(cwd, ".tickets/index.json"), "{not-json", "utf8");

    const index = await readIndex(cwd);
    expect(index.tickets).toHaveLength(1);
    expect(index.tickets[0].id).toBe("01ARZ3NDEKTSV4RRFFQ69G5FAA");
  });

  it("throws not_initialized when .tickets is missing", async () => {
    const cwd = await mkTempRepo(false);
    await expect(readIndex(cwd)).rejects.toThrow("Ticket system not initialized");
  });
});
