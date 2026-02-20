import { promises as fs } from "node:fs";
import path from "node:path";
import { INDEX_PATH, TICKETS_DIR } from "../lib/constants.js";
import { ERROR_CODE, EXIT_CODE, TicketError } from "../lib/errors.js";
import { generateIndex, loadIndexFromDisk, rebuildIndex, type TicketsIndex } from "../lib/index.js";
import { successEnvelope, writeEnvelope } from "../lib/json.js";
import { parseTicketDocument } from "../lib/parse.js";
import { resolvePolicyTier } from "../lib/policy-tier.js";

export interface ValidateCommandOptions {
  fix?: boolean;
  ci?: boolean;
  json?: boolean;
  policyTier?: string;
}

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function sameIndexShape(actual: TicketsIndex | null, expected: TicketsIndex): boolean {
  if (!actual) return false;
  if (actual.format_version !== expected.format_version) return false;
  if (actual.workflow !== expected.workflow) return false;
  return JSON.stringify(actual.tickets) === JSON.stringify(expected.tickets);
}

interface ParsedTicketForPolicy {
  file: string;
  body: string;
  frontmatter: {
    assignee?: string;
    reviewer?: string;
  };
}

function hasChecklistInSection(body: string, heading: string): boolean {
  const section = new RegExp(`(?:^|\\n)##\\s+${heading}\\s*[\\r\\n]+([\\s\\S]*?)(?=\\n##\\s+|$)`, "i");
  const match = body.match(section);
  if (!match) {
    return false;
  }
  return /(?:^|\n)\s*-\s*\[(?: |x|X)\]/.test(match[1]);
}

function sectionContentLength(body: string, heading: string): number {
  const section = new RegExp(`(?:^|\\n)##\\s+${heading}\\s*[\\r\\n]+([\\s\\S]*?)(?=\\n##\\s+|$)`, "i");
  const match = body.match(section);
  if (!match) {
    return 0;
  }
  return match[1].replace(/\s+/g, " ").trim().length;
}

function runQualityChecks(tickets: ParsedTicketForPolicy[]): string[] {
  const warnings: string[] = [];
  for (const ticket of tickets) {
    if (!hasChecklistInSection(ticket.body, "Acceptance Criteria")) {
      warnings.push(`${ticket.file}: missing checklist items under 'Acceptance Criteria'`);
    }
    if (sectionContentLength(ticket.body, "Problem") < 24) {
      warnings.push(`${ticket.file}: weak or missing 'Problem' section content`);
    }
    if (sectionContentLength(ticket.body, "Spec") < 24) {
      warnings.push(`${ticket.file}: weak or missing 'Spec' section content`);
    }
  }
  return warnings;
}

function runStrictChecks(tickets: ParsedTicketForPolicy[]): string[] {
  const failures: string[] = [];
  for (const ticket of tickets) {
    if (!ticket.frontmatter.assignee) {
      failures.push(`${ticket.file}: strict tier requires assignee`);
    }
    if (!ticket.frontmatter.reviewer) {
      failures.push(`${ticket.file}: strict tier requires reviewer`);
    }
  }
  return failures;
}

export async function runValidate(cwd: string, options: ValidateCommandOptions): Promise<void> {
  const fix = options.fix ?? false;
  const policyTier = await resolvePolicyTier({ cwd, cliTier: options.policyTier });
  const ticketsDir = path.join(cwd, TICKETS_DIR);
  await fs.mkdir(ticketsDir, { recursive: true });
  const files = (await fs.readdir(ticketsDir))
    .filter((name) => name.endsWith(".md"))
    .sort((a, b) => a.localeCompare(b));

  const integrityFailures: string[] = [];
  const parsedTickets: ParsedTicketForPolicy[] = [];

  for (const file of files) {
    const stem = file.replace(/\.md$/, "");
    if (!ULID_RE.test(stem)) {
      integrityFailures.push(`${file}: filename must be a valid ULID`);
    }

    const ticketPath = path.join(ticketsDir, file);
    const markdown = await fs.readFile(ticketPath, "utf8");
    try {
      const parsed = parseTicketDocument(markdown, file, stem);
      parsedTickets.push({
        file,
        body: parsed.parsed.content,
        frontmatter: {
          assignee: parsed.frontmatter.assignee,
          reviewer: parsed.frontmatter.reviewer
        }
      });
    } catch (error) {
      if (error instanceof TicketError) {
        integrityFailures.push(error.message);
      } else {
        const message = error instanceof Error ? error.message : String(error);
        integrityFailures.push(`${file}: invalid YAML frontmatter (${message})`);
      }
    }
  }

  let expectedIndex: TicketsIndex | null = null;
  if (integrityFailures.length === 0) {
    try {
      expectedIndex = await generateIndex(cwd);
    } catch (error) {
      if (error instanceof TicketError) {
        integrityFailures.push(error.message);
      } else {
        const message = error instanceof Error ? error.message : String(error);
        integrityFailures.push(`failed to build ${INDEX_PATH} from tickets (${message})`);
      }
    }
  }

  const actualIndex = await loadIndexFromDisk(cwd);
  const indexStale = expectedIndex == null ? actualIndex == null : !sameIndexShape(actualIndex, expectedIndex);
  if (indexStale) {
    if (fix && integrityFailures.length === 0) {
      await rebuildIndex(cwd);
    } else {
      integrityFailures.push("index.json is missing, invalid, or stale");
    }
  }

  const qualityFindings = policyTier.quality === "off" ? [] : runQualityChecks(parsedTickets);
  const strictFindings = policyTier.strict === "off" ? [] : runStrictChecks(parsedTickets);

  const warnings: string[] = [];
  const failures: string[] = [...integrityFailures];

  if (policyTier.quality === "warn") {
    warnings.push(...qualityFindings);
  } else if (policyTier.quality === "fail") {
    failures.push(...qualityFindings);
  }

  if (policyTier.strict === "warn") {
    warnings.push(...strictFindings);
  } else if (policyTier.strict === "fail") {
    failures.push(...strictFindings);
  }

  if (failures.length > 0) {
    throw new TicketError(
      ERROR_CODE.VALIDATION_FAILED,
      `Validation failed:\n- ${failures.join("\n- ")}`,
      EXIT_CODE.VALIDATION_FAILED,
      { errors: failures, warnings, indexStatus: indexStale ? ERROR_CODE.INDEX_OUT_OF_SYNC : null, policyTier: policyTier.tier }
    );
  }

  const fixesApplied = Boolean(fix && indexStale);
  if (options.json) {
    writeEnvelope(successEnvelope({
      valid: true,
      policy_tier: policyTier.tier,
      fix_requested: fix,
      fixes_applied: fixesApplied,
      checks: {
        integrity: "fail",
        quality: policyTier.quality,
        strict: policyTier.strict
      }
    }, warnings));
    return;
  }

  for (const warning of warnings) {
    console.warn(`Warning: ${warning}`);
  }

  if (fix) {
    console.log(fixesApplied ? "Validation passed (applied fixes)." : "Validation passed (no fixes needed).");
    return;
  }

  console.log(`Validation passed (tier: ${policyTier.tier}).`);
}
