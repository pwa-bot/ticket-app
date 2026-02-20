import type { Priority, TicketIndexEntry, TicketState } from "@ticketdotapp/core";

export const BOARD_STATES: TicketState[] = ["backlog", "ready", "in_progress", "blocked", "done"];

export const BOARD_LABELS: Record<TicketState, string> = {
  backlog: "Backlog",
  ready: "Ready",
  in_progress: "In Progress",
  done: "Done",
  blocked: "Blocked",
};

export const PRIORITY_STYLES: Record<Priority, string> = {
  p0: "bg-red-100 text-red-800 border-red-200",
  p1: "bg-orange-100 text-orange-800 border-orange-200",
  p2: "bg-yellow-100 text-yellow-800 border-yellow-200",
  p3: "bg-zinc-100 text-zinc-700 border-zinc-200",
};

export function groupTicketsForBoard(tickets: TicketIndexEntry[]): Record<TicketState, TicketIndexEntry[]> {
  const grouped: Record<TicketState, TicketIndexEntry[]> = {
    backlog: [],
    ready: [],
    in_progress: [],
    done: [],
    blocked: [],
  };

  tickets.forEach((ticket) => {
    grouped[ticket.state].push(ticket);
  });

  return grouped;
}
