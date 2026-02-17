import { STATE_ORDER, type TicketState } from "./constants.js";
import { ERROR_CODE, EXIT_CODE, TicketError } from "./errors.js";

const WORKFLOW_TRANSITIONS: Record<TicketState, TicketState[]> = {
  backlog: ["ready", "blocked"],
  ready: ["in_progress", "blocked"],
  in_progress: ["done", "blocked"],
  blocked: ["ready", "in_progress", "blocked"],
  done: []
};

export function normalizeState(value: string): TicketState {
  if (!STATE_ORDER.includes(value as TicketState)) {
    throw new TicketError(
      ERROR_CODE.INVALID_STATE,
      `Invalid state '${value}'. Allowed: ${STATE_ORDER.join(", ")}`,
      EXIT_CODE.USAGE,
      { value, allowed: STATE_ORDER }
    );
  }
  return value as TicketState;
}

export function canTransition(from: TicketState, to: TicketState): boolean {
  if (from === to) {
    return true;
  }
  return WORKFLOW_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: TicketState, to: TicketState): void {
  if (!canTransition(from, to)) {
    throw new TicketError(
      ERROR_CODE.INVALID_TRANSITION,
      `Invalid transition: ${from} -> ${to}`,
      EXIT_CODE.INVALID_TRANSITION,
      { from, to }
    );
  }
}
