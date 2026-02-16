import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import matter from "gray-matter";
import { afterEach, describe, expect, it } from "vitest";
import { rebuildIndex } from "../lib/index.js";
import { runEdit } from "../commands/edit.js";

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args]);
  return stdout.trim();
}

async function mkTempRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ticket-edit-test-"));
  tempDirs.push(dir);
  await fs.mkdir(path.join(dir, ".tickets/tickets"), { recursive: true });
  await git(dir, "init");
  await git(dir, "config", "user.email", "tests@example.com");
  await git(dir, "config", "user.name", "Ticket Tests");
  return dir;
}

async function writeTicket(cwd: string, id: string): Promise<void> {
  const file = path.join(cwd, ".tickets/tickets", `${id}.md`);
  const contents = `---
id: ${id}
title: Original title
state: ready
priority: p1
labels:
  - backend
created: 2026-02-16T00:00:00.000Z
updated: 2026-02-16T00:00:00.000Z
---
`;
  await fs.writeFile(file, contents, "utf8");
}

async function readTicket(cwd: string, id: string): Promise<matter.GrayMatterFile<string>> {
  const file = path.join(cwd, ".tickets/tickets", `${id}.md`);
  const markdown = await fs.readFile(file, "utf8");
  return matter(markdown);
}

describe("edit command", () => {
  it("updates title, priority, labels, updated timestamp and commits", async () => {
    const cwd = await mkTempRepo();
    const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
    await writeTicket(cwd, id);
    await rebuildIndex(cwd);

    await runEdit(cwd, "01ARZ3ND", {
      title: "New title",
      priority: "p0",
      labels: ["+frontend", "-backend"],
      ci: false
    });

    const parsed = await readTicket(cwd, id);
    expect(parsed.data.title).toBe("New title");
    expect(parsed.data.priority).toBe("p0");
    expect(parsed.data.labels).toEqual(["frontend"]);
    expect(parsed.data.updated).not.toBe("2026-02-16T00:00:00.000Z");
    await expect(git(cwd, "log", "-1", "--pretty=%s")).resolves.toBe("edit(TK-01ARZ3ND): title, priority, labels");
  });

  it("supports ci mode exact matching and label replacement", async () => {
    const cwd = await mkTempRepo();
    const id = "01ARZ3P9E4C1N2EXAMPLEABCDE";
    await writeTicket(cwd, id);
    await rebuildIndex(cwd);

    await runEdit(cwd, id, { labels: ["bug,urgent"], ci: true });

    const parsed = await readTicket(cwd, id);
    expect(parsed.data.labels).toEqual(["bug", "urgent"]);
  });

  it("rejects no-op updates", async () => {
    const cwd = await mkTempRepo();
    const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
    await writeTicket(cwd, id);
    await rebuildIndex(cwd);

    await expect(runEdit(cwd, id, { ci: true })).rejects.toThrow("No changes to apply");
  });
});
