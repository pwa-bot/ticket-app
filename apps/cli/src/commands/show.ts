import { promises as fs } from "node:fs";
import path from "node:path";
import { readIndex } from "../lib/io.js";
import { successEnvelope, writeEnvelope } from "../lib/json.js";
import { parseTicketDocument } from "../lib/parse.js";
import { getQaChecklistMissingSections, qaIndicator } from "../lib/qa.js";
import { resolveTicket } from "../lib/resolve.js";

export interface ShowCommandOptions {
  ci?: boolean;
  json?: boolean;
}

export async function runShow(cwd: string, id: string, options: ShowCommandOptions): Promise<void> {
  const index = await readIndex(cwd);
  const ticket = resolveTicket(index, id, options.ci ?? false);
  const markdown = await fs.readFile(path.join(cwd, ticket.path), "utf8");
  const parsed = parseTicketDocument(markdown, path.basename(ticket.path), ticket.id);
  const missingQaSections = getQaChecklistMissingSections(parsed.parsed.content);
  const qaSignal = qaIndicator(parsed.frontmatter.qa?.status) || "QA_NONE";
  const qaStatus = parsed.frontmatter.qa?.status ?? null;
  const qaRequired = parsed.frontmatter.qa?.required === true;
  const qaChecklistComplete = missingQaSections.length === 0;

  if (options.json) {
    const data = {
      ticket,
      frontmatter: parsed.frontmatter,
      qa: {
        required: qaRequired,
        status: qaStatus,
        signal: qaSignal,
        status_reason: parsed.frontmatter.qa?.status_reason ?? null,
        environment: parsed.frontmatter.qa?.environment ?? null,
        checklist_complete: qaChecklistComplete,
        missing_sections: missingQaSections,
        latest_decision: qaStatus
      },
      body_md: parsed.parsed.content
    };
    writeEnvelope(successEnvelope(data));
    return;
  }

  const qaSummary = [
    "QA SUMMARY",
    `required: ${qaRequired ? "yes" : "no"}`,
    `status: ${qaStatus ?? "unset"}`,
    `signal: ${qaSignal}`,
    `checklist: ${qaChecklistComplete ? "complete" : `missing ${missingQaSections.join(", ")}`}`,
    `environment: ${parsed.frontmatter.qa?.environment ?? "-"}`,
    `reason: ${parsed.frontmatter.qa?.status_reason ?? "-"}`
  ].join("\n");

  process.stdout.write(`${qaSummary}\n\n`);
  process.stdout.write(markdown.endsWith("\n") ? markdown : `${markdown}\n`);
}
