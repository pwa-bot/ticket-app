import path from "node:path";
import { autoCommit } from "../lib/git.js";
import { rebuildIndex } from "../lib/index.js";
import { PRIORITY_ORDER, STATE_ORDER, type TicketPriority, type TicketState } from "../lib/constants.js";
import { ERROR_CODE, EXIT_CODE, TicketError } from "../lib/errors.js";
import { createTicket } from "../lib/ticket.js";
import { displayId } from "../lib/ulid.js";

export interface NewCommandOptions {
  priority: string;
  state: string;
  label: string[];
}

function normalizeState(state: string): TicketState {
  const normalized = state.toLowerCase();
  if (!STATE_ORDER.includes(normalized as TicketState)) {
    throw new TicketError(
      ERROR_CODE.INVALID_STATE,
      `Invalid state '${state}'. Allowed: ${STATE_ORDER.join(", ")}`,
      EXIT_CODE.USAGE,
      { state, allowed: STATE_ORDER }
    );
  }
  return normalized as TicketState;
}

function normalizePriority(priority: string): TicketPriority {
  const normalized = priority.toLowerCase();
  if (!PRIORITY_ORDER.includes(normalized as TicketPriority)) {
    throw new TicketError(
      ERROR_CODE.INVALID_PRIORITY,
      `Invalid priority '${priority}'. Allowed: ${PRIORITY_ORDER.join(", ")}`,
      EXIT_CODE.USAGE,
      { priority, allowed: PRIORITY_ORDER }
    );
  }
  return normalized as TicketPriority;
}

export async function runNew(cwd: string, title: string, options: NewCommandOptions): Promise<void> {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    throw new TicketError(
      ERROR_CODE.INVALID_TITLE,
      "Ticket title must not be empty or whitespace-only",
      EXIT_CODE.USAGE
    );
  }

  const state = normalizeState(options.state);
  const priority = normalizePriority(options.priority);
  const labels = (options.label ?? []).map((label) => label.toLowerCase());

  const created = await createTicket(cwd, {
    title: trimmedTitle,
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
      `ticket: create ${display} ${trimmedTitle}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Warning: git auto-commit failed: ${message}`);
  }

  console.log(`Created ${display}`);
  console.log(created.path);
}
