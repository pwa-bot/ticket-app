import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import matter from "gray-matter";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

async function mkRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ticket-new-template-cli-test-"));
  tempDirs.push(dir);
  return dir;
}

async function runCli(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  const cliEntrypoint = path.resolve(process.cwd(), "src/cli.ts");
  const tsxBin = path.resolve(process.cwd(), "node_modules/.bin/tsx");
  return execFileAsync(tsxBin, [cliEntrypoint, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      TICKET_TELEMETRY_BACKEND: "off"
    }
  });
}

describe("new CLI template selection", () => {
  it("creates a ticket from built-in bug template with template metadata and label", async () => {
    const cwd = await mkRepo();
    await runCli(cwd, ["init"]);

    await runCli(cwd, ["new", "Fix auth bug", "--template", "bug", "--ci"]);

    const ticketFiles = (await fs.readdir(path.join(cwd, ".tickets/tickets")))
      .filter((name) => name.endsWith(".md"));
    expect(ticketFiles).toHaveLength(1);

    const markdown = await fs.readFile(path.join(cwd, ".tickets/tickets", ticketFiles[0]), "utf8");
    const parsed = matter(markdown);
    expect(parsed.data.template).toBe("bug");
    expect(parsed.data.labels).toContain("bug");
    expect(parsed.data.labels).toContain("template:bug");
    expect(parsed.content).toContain("## Steps To Reproduce");
  });

  it("fails when template does not exist", async () => {
    const cwd = await mkRepo();
    await runCli(cwd, ["init"]);

    try {
      await runCli(cwd, ["new", "Some work", "--template", "missing-template", "--ci"]);
      throw new Error("Expected template lookup to fail");
    } catch (error) {
      const failed = error as { code?: number; stderr?: string };
      expect(failed.code).toBe(2);
      expect(failed.stderr ?? "").toContain("Template 'missing-template' not found");
    }
  });
});
