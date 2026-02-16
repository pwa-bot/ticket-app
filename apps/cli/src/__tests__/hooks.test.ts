import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runInstallHooks } from "../commands/install-hooks.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

async function mkTempRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ticket-hooks-test-"));
  tempDirs.push(dir);
  await fs.mkdir(path.join(dir, ".git/hooks"), { recursive: true });
  return dir;
}

describe("install-hooks command", () => {
  it("creates pre-commit hook with executable permissions", async () => {
    const cwd = await mkTempRepo();
    const hookPath = path.join(cwd, ".git/hooks/pre-commit");

    await runInstallHooks(cwd, {});

    const hook = await fs.readFile(hookPath, "utf8");
    expect(hook).toBe("#!/bin/sh\nticket validate --ci || exit 1\n");

    const stat = await fs.stat(hookPath);
    expect(stat.mode & 0o111).toBeGreaterThan(0);
  });

  it("does not overwrite existing hook when confirmation is denied", async () => {
    const cwd = await mkTempRepo();
    const hookPath = path.join(cwd, ".git/hooks/pre-commit");
    await fs.writeFile(hookPath, "#!/bin/sh\necho keep\n", "utf8");

    await runInstallHooks(cwd, { confirmOverwrite: async () => false });

    await expect(fs.readFile(hookPath, "utf8")).resolves.toBe("#!/bin/sh\necho keep\n");
  });

  it("overwrites existing hook when force is enabled", async () => {
    const cwd = await mkTempRepo();
    const hookPath = path.join(cwd, ".git/hooks/pre-commit");
    await fs.writeFile(hookPath, "#!/bin/sh\necho old\n", "utf8");

    await runInstallHooks(cwd, { force: true });

    await expect(fs.readFile(hookPath, "utf8")).resolves.toBe("#!/bin/sh\nticket validate --ci || exit 1\n");
  });
});
