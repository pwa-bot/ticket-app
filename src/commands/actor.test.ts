import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import matter from "gray-matter";
import { afterEach, describe, expect, it } from "vitest";
import { rebuildIndex } from "../lib/index.js";
import { runAssign, runReviewer } from "./actor.js";

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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ticket-actor-test-"));
  tempDirs.push(dir);
  await fs.mkdir(path.join(dir, ".tickets/tickets"), { recursive: true });
  await git(dir, "init");
  await git(dir, "config", "user.email", "tests@example.com");
  await git(dir, "config", "user.name", "Ticket Tests");
  return dir;
}

async function writeTicket(cwd: string, id: string): Promise<void> {
  const file = path.join(cwd, ".tickets/tickets", `${id}.md`);
  const contents = `---\nid: ${id}\ntitle: Example ticket\nstate: ready\npriority: p1\nlabels: []\n---\n`;
  await fs.writeFile(file, contents, "utf8");
}

async function readTicketField(cwd: string, id: string, field: "assignee" | "reviewer"): Promise<unknown> {
  const file = path.join(cwd, ".tickets/tickets", `${id}.md`);
  const markdown = await fs.readFile(file, "utf8");
  const parsed = matter(markdown);
  return parsed.data[field];
}

describe("actor commands", () => {
  it("sets assignee by short id and creates expected commit", async () => {
    const cwd = await mkTempRepo();
    const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
    await writeTicket(cwd, id);
    await rebuildIndex(cwd);

    await runAssign(cwd, "01ARZ3ND", "human:morgan", {});

    await expect(readTicketField(cwd, id, "assignee")).resolves.toBe("human:morgan");
    await expect(git(cwd, "log", "-1", "--pretty=%s")).resolves.toBe(
      "ticket: assign TK-01ARZ3ND to human:morgan"
    );
  });

  it("sets reviewer by full id in ci mode and creates expected commit", async () => {
    const cwd = await mkTempRepo();
    const id = "01ARZ3P9E4C1N2EXAMPLEABCDE";
    await writeTicket(cwd, id);
    await rebuildIndex(cwd);

    await runReviewer(cwd, id, "agent:openclaw", { ci: true });

    await expect(readTicketField(cwd, id, "reviewer")).resolves.toBe("agent:openclaw");
    await expect(git(cwd, "log", "-1", "--pretty=%s")).resolves.toBe(
      "ticket: reviewer TK-01ARZ3P9 to agent:openclaw"
    );
  });

  it("rejects fuzzy id in ci mode", async () => {
    const cwd = await mkTempRepo();
    const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
    await writeTicket(cwd, id);
    await rebuildIndex(cwd);

    await expect(runAssign(cwd, "01ARZ3", "human:morgan", { ci: true })).rejects.toThrow("Ticket not found");
  });
});
