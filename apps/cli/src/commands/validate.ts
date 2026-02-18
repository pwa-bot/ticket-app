import { promises as fs } from "node:fs";
import path from "node:path";
import { INDEX_PATH, TICKETS_DIR } from "../lib/constants.js";
import { ERROR_CODE, EXIT_CODE, TicketError } from "../lib/errors.js";
import { generateIndex, loadIndexFromDisk, rebuildIndex, type TicketsIndex } from "../lib/index.js";
import { successEnvelope, writeEnvelope } from "../lib/json.js";
import { parseTicketDocument } from "../lib/parse.js";

export interface ValidateCommandOptions {
  fix?: boolean;
  ci?: boolean;
  json?: boolean;
}

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function sameIndexShape(actual: TicketsIndex | null, expected: TicketsIndex): boolean {
  if (!actual) return false;
  if (actual.format_version !== expected.format_version) return false;
  if (actual.workflow !== expected.workflow) return false;
  return JSON.stringify(actual.tickets) === JSON.stringify(expected.tickets);
}

export async function runValidate(cwd: string, options: ValidateCommandOptions): Promise<void> {
  const fix = options.fix ?? false;
  const ticketsDir = path.join(cwd, TICKETS_DIR);
  await fs.mkdir(ticketsDir, { recursive: true });
  const files = (await fs.readdir(ticketsDir))
    .filter((name) => name.endsWith(".md"))
    .sort((a, b) => a.localeCompare(b));

  const errors: string[] = [];

  for (const file of files) {
    const stem = file.replace(/\.md$/, "");
    if (!ULID_RE.test(stem)) {
      errors.push(`${file}: filename must be a valid ULID`);
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

  let expectedIndex: TicketsIndex | null = null;
  if (errors.length === 0) {
    try {
      expectedIndex = await generateIndex(cwd);
    } catch (error) {
      if (error instanceof TicketError) {
        errors.push(error.message);
      } else {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`failed to build ${INDEX_PATH} from tickets (${message})`);
      }
    }
  }

  const actualIndex = await loadIndexFromDisk(cwd);
  const indexStale = expectedIndex == null ? actualIndex == null : !sameIndexShape(actualIndex, expectedIndex);
  if (indexStale) {
    if (fix && errors.length === 0) {
      await rebuildIndex(cwd);
    } else {
      errors.push("index.json is missing, invalid, or stale");
    }
  }

  if (errors.length > 0) {
    throw new TicketError(
      ERROR_CODE.VALIDATION_FAILED,
      `Validation failed:\n- ${errors.join("\n- ")}`,
      EXIT_CODE.VALIDATION_FAILED,
      { errors, indexStatus: indexStale ? ERROR_CODE.INDEX_OUT_OF_SYNC : null }
    );
  }

  const fixesApplied = Boolean(fix && indexStale);
  if (options.json) {
    writeEnvelope(successEnvelope({
      valid: true,
      fix_requested: fix,
      fixes_applied: fixesApplied
    }));
    return;
  }

  if (fix) {
    console.log(fixesApplied ? "Validation passed (applied fixes)." : "Validation passed (no fixes needed).");
    return;
  }

  console.log("Validation passed.");
}
