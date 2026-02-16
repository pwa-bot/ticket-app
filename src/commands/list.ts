import { PRIORITY_ORDER, STATE_ORDER, type TicketState } from "../lib/constants.js";
import { readIndex } from "../lib/io.js";

export interface ListCommandOptions {
  state?: string;
  label?: string;
  format?: string;
}

function validateState(value: string): TicketState {
  if (!STATE_ORDER.includes(value as TicketState)) {
    throw new Error(`Invalid state '${value}'. Allowed: ${STATE_ORDER.join(", ")}`);
  }
  return value as TicketState;
}

function validateFormat(value: string): "table" | "kanban" {
  if (value !== "table" && value !== "kanban") {
    throw new Error("Invalid format. Allowed: table, kanban");
  }
  return value;
}

function stateSortIndex(state: string): number {
  return STATE_ORDER.indexOf(state as TicketState);
}

function prioritySortIndex(priority: string): number {
  return PRIORITY_ORDER.indexOf(priority as (typeof PRIORITY_ORDER)[number]);
}

function pad(value: string, width: number): string {
  return value.padEnd(width, " ");
}

function renderTable(tickets: Array<{ display_id: string; state: string; priority: string; title: string; labels: string[] }>): void {
  if (tickets.length === 0) {
    console.log("No tickets found.");
    return;
  }

  const rows = tickets.map((ticket) => ({
    id: ticket.display_id,
    state: ticket.state,
    priority: ticket.priority,
    title: ticket.title,
    labels: ticket.labels.join(",")
  }));

  const widths = {
    id: Math.max("ID".length, ...rows.map((row) => row.id.length)),
    state: Math.max("STATE".length, ...rows.map((row) => row.state.length)),
    priority: Math.max("PRIORITY".length, ...rows.map((row) => row.priority.length)),
    title: Math.max("TITLE".length, ...rows.map((row) => row.title.length))
  };

  console.log(`${pad("ID", widths.id)}  ${pad("STATE", widths.state)}  ${pad("PRIORITY", widths.priority)}  ${pad("TITLE", widths.title)}  LABELS`);
  for (const row of rows) {
    console.log(`${pad(row.id, widths.id)}  ${pad(row.state, widths.state)}  ${pad(row.priority, widths.priority)}  ${pad(row.title, widths.title)}  ${row.labels}`);
  }
}

function renderKanban(tickets: Array<{ display_id: string; state: string; priority: string; title: string; labels: string[] }>): void {
  for (const state of STATE_ORDER) {
    const column = tickets.filter((ticket) => ticket.state === state);
    console.log(`${state} (${column.length})`);
    if (column.length === 0) {
      console.log("  (empty)");
      continue;
    }

    for (const ticket of column) {
      const labels = ticket.labels.length > 0 ? ` [${ticket.labels.join(",")}]` : "";
      console.log(`  - ${ticket.display_id} (${ticket.priority}) ${ticket.title}${labels}`);
    }
  }
}

export async function runList(cwd: string, options: ListCommandOptions): Promise<void> {
  const index = await readIndex(cwd);

  const requestedState = options.state ? validateState(options.state) : undefined;
  const requestedLabel = options.label?.toLowerCase().trim();
  const format = validateFormat(options.format ?? "table");

  const tickets = index.tickets
    .filter((ticket) => (requestedState ? ticket.state === requestedState : true))
    .filter((ticket) => (requestedLabel ? ticket.labels.includes(requestedLabel) : true))
    .sort((a, b) => {
      const stateDiff = stateSortIndex(a.state) - stateSortIndex(b.state);
      if (stateDiff !== 0) return stateDiff;

      const priorityDiff = prioritySortIndex(a.priority) - prioritySortIndex(b.priority);
      if (priorityDiff !== 0) return priorityDiff;

      return a.id.localeCompare(b.id);
    });

  if (format === "kanban") {
    renderKanban(tickets);
    return;
  }

  renderTable(tickets);
}
