import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { TEMPLATE_PATH, TICKETS_DIR, DEFAULT_TEMPLATE, PRIORITY_ORDER, STATE_ORDER, type TicketPriority, type TicketState } from "./constants.js";
import { ERROR_CODE, EXIT_CODE, TicketError } from "./errors.js";
import { generateTicketId } from "./ulid.js";

export interface CreateTicketInput {
  title: string;
  state: TicketState;
  priority: TicketPriority;
  labels: string[];
}

export interface CreatedTicket {
  id: string;
  path: string;
}

function assertState(state: string): asserts state is TicketState {
  if (!STATE_ORDER.includes(state as TicketState)) {
    throw new TicketError(
      ERROR_CODE.INVALID_STATE,
      `Invalid state: ${state}`,
      EXIT_CODE.USAGE,
      { state, allowed: STATE_ORDER }
    );
  }
}

function assertPriority(priority: string): asserts priority is TicketPriority {
  if (!PRIORITY_ORDER.includes(priority as TicketPriority)) {
    throw new TicketError(
      ERROR_CODE.INVALID_PRIORITY,
      `Invalid priority: ${priority}`,
      EXIT_CODE.USAGE,
      { priority, allowed: PRIORITY_ORDER }
    );
  }
}

async function readTemplate(cwd: string): Promise<string> {
  const templatePath = path.join(cwd, TEMPLATE_PATH);
  try {
    return await fs.readFile(templatePath, "utf8");
  } catch {
    return DEFAULT_TEMPLATE;
  }
}

export async function createTicket(cwd: string, input: CreateTicketInput): Promise<CreatedTicket> {
  const title = input.title.trim();
  if (!title) {
    throw new TicketError(ERROR_CODE.VALIDATION_FAILED, "Ticket title must be non-empty", EXIT_CODE.VALIDATION_FAILED);
  }

  assertState(input.state);
  assertPriority(input.priority);

  const id = generateTicketId();
  const labels = [...new Set(input.labels.map((label) => label.toLowerCase().trim()).filter(Boolean))];
  const template = await readTemplate(cwd);

  const rendered = template
    .replaceAll("{{id}}", id)
    .replaceAll("{{title}}", title)
    .replaceAll("{{state}}", input.state)
    .replaceAll("{{priority}}", input.priority);

  const parsed = matter(rendered);
  parsed.data.id = id;
  parsed.data.title = title;
  parsed.data.state = input.state;
  parsed.data.priority = input.priority;
  parsed.data.labels = labels;

  const output = matter.stringify(parsed.content, parsed.data);
  const ticketsDir = path.join(cwd, TICKETS_DIR);
  await fs.mkdir(ticketsDir, { recursive: true });

  const ticketPath = path.join(ticketsDir, `${id}.md`);
  await fs.writeFile(ticketPath, output, "utf8");

  return { id, path: ticketPath };
}
