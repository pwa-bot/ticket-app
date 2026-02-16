import path from "node:path";
import { autoCommit } from "../lib/git.js";
import { rebuildIndex } from "../lib/index.js";
import { PRIORITY_ORDER, STATE_ORDER, type TicketPriority, type TicketState } from "../lib/constants.js";
import { createTicket } from "../lib/ticket.js";
import { displayId } from "../lib/ulid.js";

export interface NewCommandOptions {
  priority: string;
  state: string;
  label: string[];
}

function normalizeState(state: string): TicketState {
  if (!STATE_ORDER.includes(state as TicketState)) {
    throw new Error(`Invalid state '${state}'. Allowed: ${STATE_ORDER.join(", ")}`);
  }
  return state as TicketState;
}

function normalizePriority(priority: string): TicketPriority {
  if (!PRIORITY_ORDER.includes(priority as TicketPriority)) {
    throw new Error(`Invalid priority '${priority}'. Allowed: ${PRIORITY_ORDER.join(", ")}`);
  }
  return priority as TicketPriority;
}

export async function runNew(cwd: string, title: string, options: NewCommandOptions): Promise<void> {
  const state = normalizeState(options.state);
  const priority = normalizePriority(options.priority);
  const labels = (options.label ?? []).map((label) => label.toLowerCase());

  const created = await createTicket(cwd, {
    title,
    state,
    priority,
    labels
  });

  await rebuildIndex(cwd);

  const display = displayId(created.id);
  const indexPath = path.join(cwd, ".tickets/index.json");

  try {
    await autoCommit(
      cwd,
      [created.path, indexPath],
      `ticket: create ${display} ${title.trim()}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Warning: git auto-commit failed: ${message}`);
  }

  console.log(`Created ${display}`);
  console.log(created.path);
}
