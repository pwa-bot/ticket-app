import { promises as fs } from "node:fs";
import path from "node:path";
import { autoCommit } from "../lib/git.js";
import { rebuildIndex } from "../lib/index.js";
import { successEnvelope, writeEnvelope } from "../lib/json.js";
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

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export interface InitCommandOptions {
  json?: boolean;
}

export async function runInit(cwd: string, options: InitCommandOptions = {}): Promise<void> {
  const rootPath = path.join(cwd, TICKETS_ROOT);
  const ticketsDirPath = path.join(cwd, TICKETS_DIR);
  const configPath = path.join(cwd, CONFIG_PATH);
  const templatePath = path.join(cwd, TEMPLATE_PATH);
  const indexPath = path.join(cwd, INDEX_PATH);

  const [hasRoot, hasTicketsDir, hasConfig, hasTemplate, hasIndex] = await Promise.all([
    pathExists(rootPath),
    pathExists(ticketsDirPath),
    pathExists(configPath),
    pathExists(templatePath),
    pathExists(indexPath)
  ]);

  const alreadyInitialized = hasRoot && hasTicketsDir && hasConfig && hasTemplate && hasIndex;
  const warnings = alreadyInitialized ? ["Ticket system already initialized."] : [];

  if (alreadyInitialized) {
    if (options.json) {
      writeEnvelope(successEnvelope({ created: [], already_initialized: true }, warnings));
      return;
    }
    console.warn("Warning: Ticket system already initialized.");
    return;
  }

  await fs.mkdir(rootPath, { recursive: true });
  await fs.mkdir(ticketsDirPath, { recursive: true });

  const wroteConfig = await writeIfMissing(configPath, DEFAULT_CONFIG);
  const wroteTemplate = await writeIfMissing(templatePath, DEFAULT_TEMPLATE);

  let generatedIndexCount: number | null = null;
  if (!hasIndex) {
    const index = await rebuildIndex(cwd);
    generatedIndexCount = index.tickets.length;
  }

  const filesToCommit: string[] = [];
  if (wroteConfig) filesToCommit.push(configPath);
  if (wroteTemplate) filesToCommit.push(templatePath);
  if (!hasIndex) filesToCommit.push(indexPath);

  if (filesToCommit.length > 0) {
    try {
      await autoCommit(cwd, filesToCommit, "ticket: init");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Warning: git auto-commit failed: ${message}`);
    }
  }

  const created = [] as string[];
  if (wroteConfig) created.push(CONFIG_PATH);
  if (wroteTemplate) created.push(TEMPLATE_PATH);
  if (!hasIndex) created.push(INDEX_PATH);

  if (options.json) {
    writeEnvelope(successEnvelope({ created, already_initialized: false }, warnings));
    return;
  }

  if (created.length > 0) {
    console.log(`Initialized ticket config: ${created.join(", ")}`);
  }
  if (generatedIndexCount !== null) {
    console.log(`Index regenerated with ${generatedIndexCount} tickets.`);
  }
}
