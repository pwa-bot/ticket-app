import { promises as fs } from "node:fs";
import path from "node:path";
import { autoCommit } from "../lib/git.js";
import { rebuildIndex } from "../lib/index.js";
import { CONFIG_PATH, DEFAULT_CONFIG, DEFAULT_TEMPLATE, INDEX_PATH, TEMPLATE_PATH, TICKETS_DIR, TICKETS_ROOT } from "../lib/constants.js";

async function writeIfMissing(filePath: string, contents: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return false;
  } catch {
    await fs.writeFile(filePath, contents, "utf8");
    return true;
  }
}

export async function runInit(cwd: string): Promise<void> {
  await fs.mkdir(path.join(cwd, TICKETS_ROOT), { recursive: true });
  await fs.mkdir(path.join(cwd, TICKETS_DIR), { recursive: true });

  const wroteConfig = await writeIfMissing(path.join(cwd, CONFIG_PATH), DEFAULT_CONFIG);
  const wroteTemplate = await writeIfMissing(path.join(cwd, TEMPLATE_PATH), DEFAULT_TEMPLATE);

  const index = await rebuildIndex(cwd);
  const indexPath = path.join(cwd, INDEX_PATH);
  const filesToCommit: string[] = [indexPath];
  if (wroteConfig) filesToCommit.push(path.join(cwd, CONFIG_PATH));
  if (wroteTemplate) filesToCommit.push(path.join(cwd, TEMPLATE_PATH));

  try {
    await autoCommit(cwd, filesToCommit, "ticket: init");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Warning: git auto-commit failed: ${message}`);
  }

  const created = [] as string[];
  if (wroteConfig) created.push(CONFIG_PATH);
  if (wroteTemplate) created.push(TEMPLATE_PATH);

  if (created.length > 0) {
    console.log(`Initialized ticket config: ${created.join(", ")}`);
  } else {
    console.log("Ticket config already initialized.");
  }
  console.log(`Index regenerated with ${index.tickets.length} tickets.`);
}
