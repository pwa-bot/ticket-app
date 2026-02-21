import { promises as fs } from "node:fs";
import path from "node:path";
import { INDEX_PATH } from "../lib/constants.js";
import { autoCommit } from "../lib/git.js";
import { rebuildIndex } from "../lib/index.js";
import { readIndex } from "../lib/io.js";
import { EXIT_CODE, ERROR_CODE, TicketError } from "../lib/errors.js";
import { shouldCommit, success } from "../lib/output.js";
import { parseTicketDocument, renderTicketDocument } from "../lib/parse.js";
import { resolveTicket } from "../lib/resolve.js";
import { assertTransition, normalizeState } from "../lib/workflow.js";

export interface MoveCommandOptions {
  ci?: boolean;
}

async function assertQaDoneGate(ticketPath: string, targetState: string): Promise<void> {
  if (targetState !== "done") {
    return;
  }

  const markdown = await fs.readFile(ticketPath, "utf8");
  const parsed = parseTicketDocument(markdown, path.basename(ticketPath));
  const qa = parsed.frontmatter.qa;
  if (qa?.required === true && qa.status !== "qa_passed") {
    throw new TicketError(
      ERROR_CODE.INVALID_TRANSITION,
      "Cannot move ticket to done: x_ticket.qa.required=true requires x_ticket.qa.status=qa_passed",
      EXIT_CODE.INVALID_TRANSITION,
      { qa_required: true, qa_status: qa.status ?? null }
    );
  }
}

async function updateTicketState(ticketPath: string, state: string): Promise<void> {
  const markdown = await fs.readFile(ticketPath, "utf8");
  const parsed = parseTicketDocument(markdown, path.basename(ticketPath));
  parsed.parsed.data.state = state;
  const output = renderTicketDocument(parsed.parsed);
  await fs.writeFile(ticketPath, output, "utf8");
}

export async function runMove(cwd: string, id: string, stateValue: string, options: MoveCommandOptions): Promise<void> {
  const state = normalizeState(stateValue);
  const index = await readIndex(cwd);
  const ticket = resolveTicket(index, id, options.ci ?? false);

  assertTransition(ticket.state, state);

  if (ticket.state === state) {
    success(`No change for ${ticket.display_id}; state is already ${state}.`);
    return;
  }

  const ticketPath = path.join(cwd, ticket.path);
  await assertQaDoneGate(ticketPath, state);
  await updateTicketState(ticketPath, state);
  await rebuildIndex(cwd);

  const indexPath = path.join(cwd, INDEX_PATH);

  if (shouldCommit()) {
    try {
      await autoCommit(
        cwd,
        [ticketPath, indexPath],
        `ticket: ${ticket.display_id} -> ${state}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Warning: git auto-commit failed: ${message}`);
    }
  }

  success(`Moved ${ticket.display_id} to ${state}`);
}

export async function runStart(cwd: string, id: string, options: MoveCommandOptions): Promise<void> {
  await runMove(cwd, id, "in_progress", options);
}

export async function runDone(cwd: string, id: string, options: MoveCommandOptions): Promise<void> {
  await runMove(cwd, id, "done", options);
}
