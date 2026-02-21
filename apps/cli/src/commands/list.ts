import { STATE_ORDER, type TicketState } from "../lib/constants.js";
import { ERROR_CODE, EXIT_CODE, TicketError } from "../lib/errors.js";
import { sortTicketsDeterministic } from "../lib/index.js";
import { readIndex } from "../lib/io.js";
import { successEnvelope, writeEnvelope } from "../lib/json.js";
import { QA_STATUS_ORDER, type QaStatus } from "../lib/parse.js";
import { qaIndicator } from "../lib/qa.js";

export interface ListCommandOptions {
  state?: string;
  qaStatus?: string;
  label?: string;
  format?: string;
  json?: boolean;
}

function validateState(value: string): TicketState {
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

function validateQaStatus(value: string): QaStatus {
  if (!QA_STATUS_ORDER.includes(value as QaStatus)) {
    throw new TicketError(
      ERROR_CODE.VALIDATION_FAILED,
      `Invalid QA status '${value}'. Allowed: ${QA_STATUS_ORDER.join(", ")}`,
      EXIT_CODE.USAGE,
      { value, allowed: QA_STATUS_ORDER }
    );
  }
  return value as QaStatus;
}

function validateFormat(value: string): "table" | "kanban" {
  if (value !== "table" && value !== "kanban") {
    throw new TicketError(ERROR_CODE.VALIDATION_FAILED, "Invalid format. Allowed: table, kanban", EXIT_CODE.USAGE, { value });
  }
  return value;
}

function pad(value: string, width: number): string {
  return value.padEnd(width, " ");
}

function renderTable(tickets: Array<{ display_id: string; state: string; priority: string; title: string; labels: string[]; qa_status?: QaStatus }>): void {
  if (tickets.length === 0) {
    console.log("No tickets found.");
    return;
  }

  const rows = tickets.map((ticket) => ({
    id: ticket.display_id,
    state: ticket.state,
    qa: qaIndicator(ticket.qa_status),
    priority: ticket.priority,
    title: ticket.title,
    labels: ticket.labels.join(",")
  }));

  const widths = {
    id: Math.max("ID".length, ...rows.map((row) => row.id.length)),
    state: Math.max("STATE".length, ...rows.map((row) => row.state.length)),
    qa: Math.max("QA".length, ...rows.map((row) => row.qa.length)),
    priority: Math.max("PRIORITY".length, ...rows.map((row) => row.priority.length)),
    title: Math.max("TITLE".length, ...rows.map((row) => row.title.length))
  };

  console.log(`${pad("ID", widths.id)}  ${pad("STATE", widths.state)}  ${pad("QA", widths.qa)}  ${pad("PRIORITY", widths.priority)}  ${pad("TITLE", widths.title)}  LABELS`);
  for (const row of rows) {
    console.log(`${pad(row.id, widths.id)}  ${pad(row.state, widths.state)}  ${pad(row.qa, widths.qa)}  ${pad(row.priority, widths.priority)}  ${pad(row.title, widths.title)}  ${row.labels}`);
  }
}

function renderKanban(tickets: Array<{ display_id: string; state: string; priority: string; title: string; labels: string[]; qa_status?: QaStatus }>): void {
  for (const state of STATE_ORDER) {
    const column = tickets.filter((ticket) => ticket.state === state);
    console.log(`${state} (${column.length})`);
    if (column.length === 0) {
      console.log("  (empty)");
      continue;
    }

    for (const ticket of column) {
      const labels = ticket.labels.length > 0 ? ` [${ticket.labels.join(",")}]` : "";
      const qa = qaIndicator(ticket.qa_status);
      const qaSuffix = qa ? ` {${qa}}` : "";
      console.log(`  - ${ticket.display_id} (${ticket.priority}) ${ticket.title}${qaSuffix}${labels}`);
    }
  }
}

export async function runList(cwd: string, options: ListCommandOptions): Promise<void> {
  const index = await readIndex(cwd);

  const requestedState = options.state ? validateState(options.state) : undefined;
  const requestedQaStatus = options.qaStatus ? validateQaStatus(options.qaStatus) : undefined;
  const requestedLabel = options.label?.toLowerCase().trim();
  const format = validateFormat(options.format ?? "table");

  const tickets = sortTicketsDeterministic(index.tickets)
    .filter((ticket) => (requestedState ? ticket.state === requestedState : true))
    .filter((ticket) => (requestedQaStatus ? ticket.qa_status === requestedQaStatus : true))
    .filter((ticket) => (requestedLabel ? ticket.labels.includes(requestedLabel) : true));

  if (options.json) {
    writeEnvelope(successEnvelope({ tickets, count: tickets.length }));
    return;
  }

  if (format === "kanban") {
    renderKanban(tickets);
    return;
  }

  renderTable(tickets);
}
