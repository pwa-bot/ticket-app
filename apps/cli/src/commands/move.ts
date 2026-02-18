import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { INDEX_PATH } from "../lib/constants.js";
import { autoCommit } from "../lib/git.js";
import { rebuildIndex } from "../lib/index.js";
import { readIndex } from "../lib/io.js";
import { shouldCommit, success } from "../lib/output.js";
import { resolveTicket } from "../lib/resolve.js";
import { displayId } from "../lib/ulid.js";
import { assertTransition, normalizeState } from "../lib/workflow.js";

export interface MoveCommandOptions {
  ci?: boolean;
}

async function updateTicketState(ticketPath: string, state: string): Promise<void> {
  const markdown = await fs.readFile(ticketPath, "utf8");
  const parsed = matter(markdown);
  parsed.data.state = state;
  const output = matter.stringify(parsed.content, parsed.data);
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
  await updateTicketState(ticketPath, state);
  await rebuildIndex(cwd);

  const indexPath = path.join(cwd, INDEX_PATH);

  if (shouldCommit()) {
    try {
      await autoCommit(
        cwd,
        [ticketPath, indexPath],
        `ticket: ${displayId(ticket.id)} -> ${state}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Warning: git auto-commit failed: ${message}`);
    }
  }

  success(`Moved ${displayId(ticket.id)} to ${state}`);
}

export async function runStart(cwd: string, id: string, options: MoveCommandOptions): Promise<void> {
  await runMove(cwd, id, "in_progress", options);
}

export async function runDone(cwd: string, id: string, options: MoveCommandOptions): Promise<void> {
  await runMove(cwd, id, "done", options);
}
