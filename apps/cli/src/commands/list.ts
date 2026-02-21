import { STATE_ORDER, type TicketState } from "../lib/constants.js";
import { ERROR_CODE, EXIT_CODE, TicketError } from "../lib/errors.js";
import { sortTicketsDeterministic } from "../lib/index.js";
import { readIndex } from "../lib/io.js";
import { successEnvelope, writeEnvelope } from "../lib/json.js";
import { QA_STATUS_ORDER, type QaStatus } from "../lib/parse.js";
import { qaIndicator } from "../lib/qa.js";

export interface ListCommandOptions {
  state?: string;
  qaStatus?: string | string[];
  qaRequired?: boolean;
  qaOptional?: boolean;
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

interface QaStatusFilter {
  statuses: QaStatus[];
  includeNone: boolean;
}

function parseQaStatusFilter(value?: string | string[]): QaStatusFilter | undefined {
  if (!value) {
    return undefined;
  }

  const values = (Array.isArray(value) ? value : [value])
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  if (values.length === 0) {
    return undefined;
  }

  const statuses: QaStatus[] = [];
  let includeNone = false;
  for (const token of values) {
    if (token === "none") {
      includeNone = true;
      continue;
    }
    statuses.push(validateQaStatus(token));
  }

  return {
    statuses: [...new Set(statuses)],
    includeNone
  };
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

function renderQaStatus(status?: QaStatus): string {
  return status ?? "-";
}

function renderQaSignal(status?: QaStatus): string {
  return qaIndicator(status) || "QA_NONE";
}

function renderTable(tickets: Array<{ display_id: string; state: string; priority: string; title: string; labels: string[]; qa_status?: QaStatus }>): void {
  if (tickets.length === 0) {
    console.log("No tickets found.");
    return;
  }

  const rows = tickets.map((ticket) => ({
    id: ticket.display_id,
    state: ticket.state,
    qaSignal: renderQaSignal(ticket.qa_status),
    qaStatus: renderQaStatus(ticket.qa_status),
    priority: ticket.priority,
    title: ticket.title,
    labels: ticket.labels.join(",")
  }));

  const widths = {
    id: Math.max("ID".length, ...rows.map((row) => row.id.length)),
    state: Math.max("STATE".length, ...rows.map((row) => row.state.length)),
    qaSignal: Math.max("QA_SIGNAL".length, ...rows.map((row) => row.qaSignal.length)),
    qaStatus: Math.max("QA_STATUS".length, ...rows.map((row) => row.qaStatus.length)),
    priority: Math.max("PRIORITY".length, ...rows.map((row) => row.priority.length)),
    title: Math.max("TITLE".length, ...rows.map((row) => row.title.length))
  };

  console.log(`${pad("ID", widths.id)}  ${pad("STATE", widths.state)}  ${pad("QA_SIGNAL", widths.qaSignal)}  ${pad("QA_STATUS", widths.qaStatus)}  ${pad("PRIORITY", widths.priority)}  ${pad("TITLE", widths.title)}  LABELS`);
  for (const row of rows) {
    console.log(`${pad(row.id, widths.id)}  ${pad(row.state, widths.state)}  ${pad(row.qaSignal, widths.qaSignal)}  ${pad(row.qaStatus, widths.qaStatus)}  ${pad(row.priority, widths.priority)}  ${pad(row.title, widths.title)}  ${row.labels}`);
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
      const qaSignal = renderQaSignal(ticket.qa_status);
      const qaStatus = renderQaStatus(ticket.qa_status);
      const qaSuffix = ` {${qaSignal}|${qaStatus}}`;
      console.log(`  - ${ticket.display_id} (${ticket.priority}) ${ticket.title}${qaSuffix}${labels}`);
    }
  }
}

export async function runList(cwd: string, options: ListCommandOptions): Promise<void> {
  const index = await readIndex(cwd);

  const requestedState = options.state ? validateState(options.state) : undefined;
  const requestedQaStatus = parseQaStatusFilter(options.qaStatus);
  if (options.qaRequired && options.qaOptional) {
    throw new TicketError(
      ERROR_CODE.VALIDATION_FAILED,
      "Cannot combine --qa-required and --qa-optional",
      EXIT_CODE.USAGE,
      { qa_required: true, qa_optional: true }
    );
  }
  const requestedLabel = options.label?.toLowerCase().trim();
  const format = validateFormat(options.format ?? "table");

  const tickets = sortTicketsDeterministic(index.tickets)
    .filter((ticket) => (requestedState ? ticket.state === requestedState : true))
    .filter((ticket) => {
      if (!requestedQaStatus) {
        return true;
      }
      if (!ticket.qa_status) {
        return requestedQaStatus.includeNone;
      }
      return requestedQaStatus.statuses.includes(ticket.qa_status);
    })
    .filter((ticket) => (options.qaRequired ? ticket.qa_required === true : true))
    .filter((ticket) => (options.qaOptional ? ticket.qa_required !== true : true))
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
