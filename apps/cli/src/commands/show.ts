import { promises as fs } from "node:fs";
import path from "node:path";
import { readIndex } from "../lib/io.js";
import { successEnvelope, writeEnvelope } from "../lib/json.js";
import { parseTicketDocument } from "../lib/parse.js";
import { getQaChecklistMissingSections } from "../lib/qa.js";
import { resolveTicket } from "../lib/resolve.js";

export interface ShowCommandOptions {
  ci?: boolean;
  json?: boolean;
}

export async function runShow(cwd: string, id: string, options: ShowCommandOptions): Promise<void> {
  const index = await readIndex(cwd);
  const ticket = resolveTicket(index, id, options.ci ?? false);
  const markdown = await fs.readFile(path.join(cwd, ticket.path), "utf8");

  if (options.json) {
    const parsed = parseTicketDocument(markdown, path.basename(ticket.path), ticket.id);
    const missingQaSections = getQaChecklistMissingSections(parsed.parsed.content);
    const data = {
      ticket,
      frontmatter: parsed.frontmatter,
      qa: {
        checklist_complete: missingQaSections.length === 0,
        missing_sections: missingQaSections,
        latest_decision: parsed.frontmatter.qa?.status ?? null
      },
      body_md: parsed.parsed.content
    };
    writeEnvelope(successEnvelope(data));
    return;
  }

  process.stdout.write(markdown.endsWith("\n") ? markdown : `${markdown}\n`);
}
