import { promises as fs } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { assertGitRepository } from "../lib/git.js";

export interface InstallHooksCommandOptions {
  force?: boolean;
  confirmOverwrite?: () => Promise<boolean>;
}

const PRE_COMMIT_CONTENT = `#!/bin/sh
ticket validate --ci || exit 1
`;

async function defaultConfirm(): Promise<boolean> {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question("pre-commit hook already exists. Overwrite? [y/N] ");
    return answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
  } finally {
    rl.close();
  }
}

export async function runInstallHooks(cwd: string, options: InstallHooksCommandOptions): Promise<void> {
  await assertGitRepository(cwd);
  const hooksDir = path.join(cwd, ".git/hooks");
  const hookPath = path.join(hooksDir, "pre-commit");
  const force = options.force ?? false;

  await fs.mkdir(hooksDir, { recursive: true });

  let exists = false;
  try {
    await fs.access(hookPath);
    exists = true;
  } catch {
    exists = false;
  }

  if (exists && !force) {
    const confirm = options.confirmOverwrite ?? defaultConfirm;
    const shouldOverwrite = await confirm();
    if (!shouldOverwrite) {
      console.log("Skipped hook installation.");
      return;
    }
  }

  await fs.writeFile(hookPath, PRE_COMMIT_CONTENT, "utf8");
  await fs.chmod(hookPath, 0o755);
  console.log(`Installed ${hookPath}`);
}
