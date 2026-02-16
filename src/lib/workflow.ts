import { STATE_ORDER, type TicketState } from "./constants.js";

const WORKFLOW_TRANSITIONS: Record<TicketState, TicketState[]> = {
  backlog: ["ready", "blocked"],
  ready: ["in_progress", "blocked"],
  in_progress: ["done", "blocked"],
  blocked: ["ready", "in_progress", "blocked"],
  done: []
};

export function normalizeState(value: string): TicketState {
  if (!STATE_ORDER.includes(value as TicketState)) {
    throw new Error(`Invalid state '${value}'. Allowed: ${STATE_ORDER.join(", ")}`);
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
    throw new Error(`Invalid transition: ${from} -> ${to}`);
  }
}
