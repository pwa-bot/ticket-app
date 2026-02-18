#!/usr/bin/env npx tsx
/**
 * Install the ticket skill to OpenClaw skills directory.
 * Copies docs/SKILL.md to the installed location.
 * 
 * Usage: npx tsx scripts/install-skill.ts [target-dir]
 * Default target: ~/.openclaw/skills/ticket/
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const SOURCE = path.join(import.meta.dirname, "..", "docs", "SKILL.md");
const DEFAULT_TARGET_DIR = path.join(os.homedir(), ".openclaw", "skills", "ticket");

async function main() {
  const targetDir = process.argv[2] || DEFAULT_TARGET_DIR;
  const targetPath = path.join(targetDir, "SKILL.md");

  // Ensure source exists
  try {
    await fs.access(SOURCE);
  } catch {
    console.error(`Source not found: ${SOURCE}`);
    process.exit(1);
  }

  // Create target directory
  await fs.mkdir(targetDir, { recursive: true });

  // Copy skill file
  await fs.copyFile(SOURCE, targetPath);

  console.log(`Installed skill to: ${targetPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
