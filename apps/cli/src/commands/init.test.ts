import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { INDEX_PATH } from "../lib/constants.js";
import { runInit } from "./init.js";

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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ticket-init-test-"));
  tempDirs.push(dir);
  await git(dir, "init");
  await git(dir, "config", "user.email", "tests@example.com");
  await git(dir, "config", "user.name", "Ticket Tests");
  return dir;
}

function captureStdout(): { output: string[] } {
  const output: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
    output.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
    return true;
  }) as typeof process.stdout.write);
  return { output };
}

describe("init command", () => {
  it("is idempotent on second run and does not create another commit", async () => {
    const cwd = await mkTempRepo();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await runInit(cwd);

    const indexPath = path.join(cwd, INDEX_PATH);
    const indexBefore = await fs.readFile(indexPath, "utf8");
    const commitCountBefore = await git(cwd, "rev-list", "--count", "HEAD");

    await runInit(cwd);

    const indexAfter = await fs.readFile(indexPath, "utf8");
    const commitCountAfter = await git(cwd, "rev-list", "--count", "HEAD");

    expect(indexAfter).toBe(indexBefore);
    expect(commitCountAfter).toBe(commitCountBefore);
    expect(logSpy).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith("Warning: Ticket system already initialized.");
  });

  it("creates only missing files for partial structure and preserves existing content", async () => {
    const cwd = await mkTempRepo();
    const configPath = path.join(cwd, ".tickets/config.yml");
    const ticketPath = path.join(cwd, ".tickets/tickets/01ARZ3NDEKTSV4RRFFQ69G5FAV.md");
    const existingConfig = "format_version: 1\nid_prefix: CUSTOM\n";
    const existingTicket = `---
id: 01ARZ3NDEKTSV4RRFFQ69G5FAV
title: Existing
state: backlog
priority: p1
labels: []
---
Body
`;

    await fs.mkdir(path.dirname(ticketPath), { recursive: true });
    await fs.writeFile(configPath, existingConfig, "utf8");
    await fs.writeFile(ticketPath, existingTicket, "utf8");

    await runInit(cwd);

    await expect(fs.readFile(configPath, "utf8")).resolves.toBe(existingConfig);
    await expect(fs.readFile(ticketPath, "utf8")).resolves.toBe(existingTicket);
    await expect(fs.access(path.join(cwd, ".tickets/template.md"))).resolves.toBeUndefined();
    await expect(fs.access(path.join(cwd, ".tickets/templates/bug.md"))).resolves.toBeUndefined();
    await expect(fs.access(path.join(cwd, ".tickets/templates/feature.md"))).resolves.toBeUndefined();
    await expect(fs.access(path.join(cwd, ".tickets/templates/chore.md"))).resolves.toBeUndefined();
    await expect(fs.access(path.join(cwd, ".tickets/index.json"))).resolves.toBeUndefined();

    const indexRaw = await fs.readFile(path.join(cwd, ".tickets/index.json"), "utf8");
    const index = JSON.parse(indexRaw) as { tickets: Array<{ id: string }> };
    expect(index.tickets).toHaveLength(1);
    expect(index.tickets[0].id).toBe("01ARZ3NDEKTSV4RRFFQ69G5FAV");
  });

  it("includes a warning in json mode when already initialized", async () => {
    const cwd = await mkTempRepo();
    await runInit(cwd);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { output } = captureStdout();

    await runInit(cwd, { json: true });

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    const payload = JSON.parse(output.join("").trim()) as {
      ok: boolean;
      data: { created: string[]; already_initialized: boolean };
      warnings: string[];
    };
    expect(payload.ok).toBe(true);
    expect(payload.data.created).toEqual([]);
    expect(payload.data.already_initialized).toBe(true);
    expect(payload.warnings).toEqual(["Ticket system already initialized."]);
  });

  it("creates built-in templates on first init", async () => {
    const cwd = await mkTempRepo();
    await runInit(cwd);

    const bug = await fs.readFile(path.join(cwd, ".tickets/templates/bug.md"), "utf8");
    const feature = await fs.readFile(path.join(cwd, ".tickets/templates/feature.md"), "utf8");
    const chore = await fs.readFile(path.join(cwd, ".tickets/templates/chore.md"), "utf8");

    expect(bug).toContain("template: bug");
    expect(feature).toContain("template: feature");
    expect(chore).toContain("template: chore");
  });
});
