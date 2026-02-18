import { promises as fs } from "node:fs";
import path from "node:path";
import { INDEX_PATH, TICKETS_DIR } from "../lib/constants.js";
import { ERROR_CODE, EXIT_CODE, TicketError } from "../lib/errors.js";
import { generateIndex, loadIndexFromDisk, type TicketsIndex } from "../lib/index.js";
import { parseTicketDocument } from "../lib/parse.js";

export interface RebuildIndexCommandOptions {
  commit?: boolean;
  json?: boolean;
}

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function sameIndexContent(actual: TicketsIndex | null, expected: TicketsIndex): boolean {
  if (!actual) return false;
  if (actual.format_version !== expected.format_version) return false;
  if (actual.workflow !== expected.workflow) return false;
  return JSON.stringify(actual.tickets) === JSON.stringify(expected.tickets);
}

export async function runRebuildIndex(cwd: string, options: RebuildIndexCommandOptions = {}): Promise<void> {
  const ticketsDir = path.join(cwd, TICKETS_DIR);
  await fs.mkdir(ticketsDir, { recursive: true });
  const files = (await fs.readdir(ticketsDir))
    .filter((name) => name.endsWith(".md"))
    .sort((a, b) => a.localeCompare(b));

  // Validate all tickets first
  const errors: string[] = [];
  for (const file of files) {
    const stem = file.replace(/\.md$/, "");
    if (!ULID_RE.test(stem)) {
      errors.push(`${file}: filename must be a valid ULID`);
      continue;
    }

    const ticketPath = path.join(ticketsDir, file);
    const markdown = await fs.readFile(ticketPath, "utf8");
    try {
      parseTicketDocument(markdown, file, stem);
    } catch (error) {
      if (error instanceof TicketError) {
        errors.push(error.message);
      } else {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${file}: invalid YAML frontmatter (${message})`);
      }
    }
  }

  // Exit 7 if any tickets are invalid
  if (errors.length > 0) {
    throw new TicketError(
      ERROR_CODE.VALIDATION_FAILED,
      `Cannot rebuild index due to invalid tickets:\n- ${errors.join("\n- ")}`,
      EXIT_CODE.VALIDATION_FAILED,
      { errors }
    );
  }

  // Check if index actually changed
  const actualIndex = await loadIndexFromDisk(cwd);
  const expectedIndex = await generateIndex(cwd);
  const indexChanged = !sameIndexContent(actualIndex, expectedIndex);

  if (!indexChanged) {
    console.log(`Index already up to date (${expectedIndex.tickets.length} tickets).`);
    return;
  }

  // Write the new index
  const indexPath = path.join(cwd, INDEX_PATH);
  await fs.writeFile(indexPath, `${JSON.stringify(expectedIndex, null, 2)}\n`, "utf8");
  console.log(`Rebuilt index with ${expectedIndex.tickets.length} tickets.`);
}
