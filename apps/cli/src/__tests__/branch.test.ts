import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runBranch } from "../commands/branch.js";
import { rebuildIndex } from "../lib/index.js";

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args]);
  return stdout.trim();
}

async function mkTempRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ticket-branch-test-"));
  tempDirs.push(dir);
  await fs.mkdir(path.join(dir, ".tickets/tickets"), { recursive: true });
  await git(dir, "init");
  await git(dir, "config", "user.email", "tests@example.com");
  await git(dir, "config", "user.name", "Ticket Tests");
  await fs.writeFile(path.join(dir, "README.md"), "test\n", "utf8");
  await git(dir, "add", "README.md");
  await git(dir, "commit", "-m", "init");
  return dir;
}

async function writeTicket(cwd: string, id: string, title: string): Promise<void> {
  const file = path.join(cwd, ".tickets/tickets", `${id}.md`);
  const contents = `---
id: ${id}
title: ${JSON.stringify(title)}
state: ready
priority: p1
labels: []
created: 2026-02-16T00:00:00.000Z
updated: 2026-02-16T00:00:00.000Z
---
`;
  await fs.writeFile(file, contents, "utf8");
}

describe("branch command", () => {
  it("creates and checks out a slugged branch name", async () => {
    const cwd = await mkTempRepo();
    const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
    await writeTicket(cwd, id, "Fix login bug!!! for #mobile");
    await rebuildIndex(cwd);

    const name = await runBranch(cwd, "01ARZ3ND", {});
    expect(name).toBe("tk-01arz3nd-fix-login-bug-for-mobile");
    await expect(git(cwd, "rev-parse", "--abbrev-ref", "HEAD")).resolves.toBe(name);
  });

  it("checks out existing branch instead of recreating it", async () => {
    const cwd = await mkTempRepo();
    const id = "01ARZ3P9E4C1N2EXAMPLEABCDE";
    await writeTicket(cwd, id, "Refactor onboarding");
    await rebuildIndex(cwd);

    const name = "tk-01arz3p9-refactor-onboarding";
    const defaultBranch = await git(cwd, "rev-parse", "--abbrev-ref", "HEAD");
    await git(cwd, "checkout", "-b", name);
    await git(cwd, "checkout", defaultBranch);

    await runBranch(cwd, id, { ci: false });
    await expect(git(cwd, "rev-parse", "--abbrev-ref", "HEAD")).resolves.toBe(name);
  });

  it("prints only in ci mode and does not switch branch", async () => {
    const cwd = await mkTempRepo();
    const id = "01ARZ3P9E4C1N2EXAMPLEABCDZ";
    await writeTicket(cwd, id, "A title");
    await rebuildIndex(cwd);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const before = await git(cwd, "rev-parse", "--abbrev-ref", "HEAD");

    const name = await runBranch(cwd, id, { ci: true });
    const after = await git(cwd, "rev-parse", "--abbrev-ref", "HEAD");

    expect(name).toBe("tk-01arz3p9-a-title");
    expect(after).toBe(before);
    expect(logSpy).toHaveBeenCalledWith("tk-01arz3p9-a-title");
  });
});
