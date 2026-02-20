import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import {
  BUILTIN_TEMPLATE_NAMES,
  TEMPLATE_PATH,
  TEMPLATES_DIR,
  TICKETS_DIR,
  DEFAULT_TEMPLATE,
  PRIORITY_ORDER,
  STATE_ORDER,
  type TicketPriority,
  type TicketState
} from "./constants.js";
import { ERROR_CODE, EXIT_CODE, TicketError } from "./errors.js";
import { generateTicketId } from "./ulid.js";

export interface CreateTicketInput {
  title: string;
  state: TicketState;
  priority: TicketPriority;
  labels: string[];
  template?: string;
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

function normalizeTemplateName(template: string): string {
  const normalized = template.toLowerCase().trim();
  if (!/^[a-z0-9-]+$/.test(normalized)) {
    throw new TicketError(
      ERROR_CODE.VALIDATION_FAILED,
      `Invalid template '${template}'. Template names must match [a-z0-9-]+`,
      EXIT_CODE.USAGE,
      { template }
    );
  }
  return normalized;
}

async function readTemplate(cwd: string, template?: string): Promise<{ contents: string; templateName?: string }> {
  if (template) {
    const templateName = normalizeTemplateName(template);
    const templatePath = path.join(cwd, TEMPLATES_DIR, `${templateName}.md`);
    try {
      const contents = await fs.readFile(templatePath, "utf8");
      return { contents, templateName };
    } catch {
      throw new TicketError(
        ERROR_CODE.VALIDATION_FAILED,
        `Template '${templateName}' not found at ${TEMPLATES_DIR}/${templateName}.md. Built-ins: ${BUILTIN_TEMPLATE_NAMES.join(", ")}`,
        EXIT_CODE.USAGE,
        { template: templateName, path: `${TEMPLATES_DIR}/${templateName}.md` }
      );
    }
  }

  const templatePath = path.join(cwd, TEMPLATE_PATH);
  try {
    return { contents: await fs.readFile(templatePath, "utf8") };
  } catch {
    return { contents: DEFAULT_TEMPLATE };
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
  const templateResult = await readTemplate(cwd, input.template);
  const labels = [...new Set(input.labels.map((label) => label.toLowerCase().trim()).filter(Boolean))];
  if (templateResult.templateName) {
    labels.push(`template:${templateResult.templateName}`);
  }
  const normalizedLabels = [...new Set(labels)];

  const rendered = templateResult.contents
    .replaceAll("{{id}}", id)
    .replaceAll("{{title}}", title)
    .replaceAll("{{state}}", input.state)
    .replaceAll("{{priority}}", input.priority);

  const parsed = matter(rendered);
  const templateLabels = Array.isArray(parsed.data.labels)
    ? parsed.data.labels
      .filter((label): label is string => typeof label === "string")
      .map((label) => label.toLowerCase().trim())
      .filter(Boolean)
    : [];

  parsed.data.id = id;
  parsed.data.title = title;
  parsed.data.state = input.state;
  parsed.data.priority = input.priority;
  parsed.data.labels = [...new Set([...templateLabels, ...normalizedLabels])];
  if (templateResult.templateName) {
    parsed.data.template = templateResult.templateName;
  }

  const output = matter.stringify(parsed.content, parsed.data);
  const ticketsDir = path.join(cwd, TICKETS_DIR);
  await fs.mkdir(ticketsDir, { recursive: true });

  const ticketPath = path.join(ticketsDir, `${id}.md`);
  await fs.writeFile(ticketPath, output, "utf8");

  return { id, path: ticketPath };
}
