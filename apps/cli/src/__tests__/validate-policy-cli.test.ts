import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

async function mkRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ticket-validate-policy-cli-test-"));
  tempDirs.push(dir);
  await fs.mkdir(path.join(dir, ".tickets/tickets"), { recursive: true });
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

describe("validate CLI policy tiers", () => {
  it("changes output and exit code between warn and strict tiers", async () => {
    const cwd = await mkRepo();
    const id = "01ARZ3NDEKTSV4RRFFQ69G5FAR";

    await fs.writeFile(
      path.join(cwd, ".tickets/tickets", `${id}.md`),
      `---
id: ${id}
title: Minimal
state: backlog
priority: p1
labels: []
---
`,
      "utf8"
    );

    await runCli(cwd, ["rebuild-index"]);

    const warnRun = await runCli(cwd, ["validate", "--ci", "--policy-tier", "warn"]);
    expect(warnRun.stdout).toContain("Validation passed");
    expect(warnRun.stderr).toContain("Warning:");
    expect(warnRun.stderr).toContain("missing checklist items under 'Acceptance Criteria'");

    try {
      await runCli(cwd, ["validate", "--ci", "--policy-tier", "strict"]);
      throw new Error("Expected strict tier validation to fail");
    } catch (error) {
      const failed = error as { code?: number; stdout?: string; stderr?: string };
      expect(failed.code).toBe(7);
      expect(failed.stderr).toContain("Validation failed:");
      expect(failed.stderr).toContain("strict tier requires assignee");
      expect(failed.stdout ?? "").toBe("");
    }
  });

  it("prints warnings even when integrity failures block the run", async () => {
    const cwd = await mkRepo();
    const id = "NOT-A-ULID";

    await fs.writeFile(
      path.join(cwd, ".tickets/tickets", `${id}.md`),
      `---
id: ${id}
title: Minimal
state: backlog
priority: p1
labels: []
---
`,
      "utf8"
    );

    try {
      await runCli(cwd, ["validate", "--ci", "--policy-tier", "warn"]);
      throw new Error("Expected warn tier validation to fail due to integrity errors");
    } catch (error) {
      const failed = error as { code?: number; stdout?: string; stderr?: string };
      expect(failed.code).toBe(7);
      expect(failed.stderr).toContain("Warning:");
      expect(failed.stderr).toContain("missing checklist items under 'Acceptance Criteria'");
      expect(failed.stderr).toContain("Validation failed:");
      expect(failed.stderr).toContain("filename must be a valid ULID");
    }
  });

  it("lets opt-in pass strict findings and keeps hard as full fail", async () => {
    const cwd = await mkRepo();
    const id = "01ARZ3NDEKTSV4RRFFQ69G5FAT";

    await fs.writeFile(
      path.join(cwd, ".tickets/tickets", `${id}.md`),
      `---
id: ${id}
title: Structured
state: ready
priority: p1
labels: []
---
## Problem

Enough detail to satisfy quality checks.

## Acceptance Criteria

- [ ] Something concrete

## Spec

Enough detail to satisfy quality checks.
`,
      "utf8"
    );

    await runCli(cwd, ["rebuild-index"]);

    const optInRun = await runCli(cwd, ["validate", "--ci", "--policy-tier", "opt-in"]);
    expect(optInRun.stdout).toContain("Validation passed");
    expect(optInRun.stderr).toContain("Warning:");
    expect(optInRun.stderr).toContain("strict tier requires assignee");

    try {
      await runCli(cwd, ["validate", "--ci", "--policy-tier", "hard"]);
      throw new Error("Expected hard tier validation to fail");
    } catch (error) {
      const failed = error as { code?: number; stdout?: string; stderr?: string };
      expect(failed.code).toBe(7);
      expect(failed.stderr).toContain("Validation failed:");
      expect(failed.stderr).toContain("strict tier requires assignee");
    }
  });
});
