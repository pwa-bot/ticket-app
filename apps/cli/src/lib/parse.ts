import matter from "gray-matter";
import { PRIORITY_ORDER, STATE_ORDER, type TicketPriority, type TicketState } from "./constants.js";
import { ERROR_CODE, EXIT_CODE, TicketError } from "./errors.js";

export const QA_STATUS_ORDER = ["pending_impl", "ready_for_qa", "qa_failed", "qa_passed"] as const;
export type QaStatus = (typeof QA_STATUS_ORDER)[number];

export interface ParsedTicketQa {
  required?: boolean;
  status?: QaStatus;
  status_reason?: string;
  environment?: string;
}

export interface ParsedTicketFrontmatter {
  id: string;
  title: string;
  state: TicketState;
  priority: TicketPriority;
  labels: string[];
  created?: string;
  assignee?: string;
  reviewer?: string;
  qa?: ParsedTicketQa;
}

export interface ParsedTicketDocument {
  parsed: matter.GrayMatterFile<string>;
  frontmatter: ParsedTicketFrontmatter;
}

function isState(value: string): value is TicketState {
  return STATE_ORDER.includes(value as TicketState);
}

function isPriority(value: string): value is TicketPriority {
  return PRIORITY_ORDER.includes(value as TicketPriority);
}

function isQaStatus(value: string): value is QaStatus {
  return QA_STATUS_ORDER.includes(value as QaStatus);
}

function requireFrontmatterEnvelope(markdown: string, file: string): string {
  const match = markdown.match(/^\ufeff?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    throw new TicketError(
      ERROR_CODE.VALIDATION_FAILED,
      `${file}: frontmatter must begin on line 1 and be delimited by exact '---' lines`,
      EXIT_CODE.VALIDATION_FAILED,
      { file }
    );
  }
  return match[1];
}

function parseCreated(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return undefined;
    }
    return value.toISOString();
  }
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  const epoch = Date.parse(value);
  if (Number.isNaN(epoch)) {
    return undefined;
  }
  return new Date(epoch).toISOString();
}

function hasOwnKey(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function isValidActor(value: string): boolean {
  return /^(human|agent):[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value);
}

export function parseTicketDocument(markdown: string, file: string, expectedId?: string): ParsedTicketDocument {
  const yamlBlock = requireFrontmatterEnvelope(markdown, file);
  if (/\t/.test(yamlBlock)) {
    throw new TicketError(
      ERROR_CODE.VALIDATION_FAILED,
      `${file}: YAML frontmatter must not contain tab characters`,
      EXIT_CODE.VALIDATION_FAILED,
      { file }
    );
  }

  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(markdown);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new TicketError(
      ERROR_CODE.VALIDATION_FAILED,
      `${file}: invalid YAML frontmatter (${message})`,
      EXIT_CODE.VALIDATION_FAILED,
      { file }
    );
  }

  const fieldErrors: string[] = [];
  const requiredKeys = ["id", "title", "state", "priority", "labels"] as const;
  for (const key of requiredKeys) {
    if (!hasOwnKey(parsed.data as Record<string, unknown>, key)) {
      fieldErrors.push(`${file}: missing required key '${key}'`);
    }
  }

  const id = typeof parsed.data.id === "string" && parsed.data.id.trim()
    ? parsed.data.id.trim()
    : "";
  if (hasOwnKey(parsed.data as Record<string, unknown>, "id") && !id) {
    fieldErrors.push(`${file}: id must be a non-empty string`);
  }

  const title = typeof parsed.data.title === "string" && parsed.data.title.trim()
    ? parsed.data.title.trim()
    : "";
  if (hasOwnKey(parsed.data as Record<string, unknown>, "title") && !title) {
    fieldErrors.push(`${file}: title must be a non-empty string`);
  }

  const stateRaw = typeof parsed.data.state === "string" && parsed.data.state.trim()
    ? parsed.data.state.trim()
    : "";
  const hasState = hasOwnKey(parsed.data as Record<string, unknown>, "state");
  if (hasState && !stateRaw) {
    fieldErrors.push(`${file}: state must be a non-empty string`);
  } else if (hasState && !isState(stateRaw)) {
    fieldErrors.push(`${file}: invalid state '${stateRaw}'`);
  }

  const priorityRaw = typeof parsed.data.priority === "string" && parsed.data.priority.trim()
    ? parsed.data.priority.trim()
    : "";
  const hasPriority = hasOwnKey(parsed.data as Record<string, unknown>, "priority");
  if (hasPriority && !priorityRaw) {
    fieldErrors.push(`${file}: priority must be a non-empty string`);
  } else if (hasPriority && !isPriority(priorityRaw)) {
    fieldErrors.push(`${file}: invalid priority '${priorityRaw}'`);
  }

  let labels: string[] = [];
  if (hasOwnKey(parsed.data as Record<string, unknown>, "labels")
      && (!Array.isArray(parsed.data.labels) || parsed.data.labels.some((entry) => typeof entry !== "string"))) {
    fieldErrors.push(`${file}: labels must be an array of strings`);
  } else {
    labels = Array.isArray(parsed.data.labels)
      ? [...new Set(parsed.data.labels.map((entry) => entry.toLowerCase().trim()).filter(Boolean))]
      : [];
  }

  if (expectedId && id && id !== expectedId) {
    fieldErrors.push(`${file}: id must match filename`);
  }

  const frontmatter: ParsedTicketFrontmatter = {
    id,
    title,
    state: stateRaw as TicketState,
    priority: priorityRaw as TicketPriority,
    labels,
    created: parseCreated(parsed.data.created)
  };

  if (hasOwnKey(parsed.data as Record<string, unknown>, "assignee")) {
    const assignee = typeof parsed.data.assignee === "string" ? parsed.data.assignee.trim() : "";
    if (!assignee || !isValidActor(assignee)) {
      fieldErrors.push(`${file}: assignee must match 'human:<slug>' or 'agent:<slug>'`);
    } else {
      frontmatter.assignee = assignee;
    }
  }
  if (hasOwnKey(parsed.data as Record<string, unknown>, "reviewer")) {
    const reviewer = typeof parsed.data.reviewer === "string" ? parsed.data.reviewer.trim() : "";
    if (!reviewer || !isValidActor(reviewer)) {
      fieldErrors.push(`${file}: reviewer must match 'human:<slug>' or 'agent:<slug>'`);
    } else {
      frontmatter.reviewer = reviewer;
    }
  }

  if (hasOwnKey(parsed.data as Record<string, unknown>, "x_ticket")) {
    const xTicket = asObject(parsed.data.x_ticket);
    if (!xTicket) {
      fieldErrors.push(`${file}: x_ticket must be an object when present`);
    } else if (hasOwnKey(xTicket, "qa")) {
      const qaRaw = asObject(xTicket.qa);
      if (!qaRaw) {
        fieldErrors.push(`${file}: x_ticket.qa must be an object when present`);
      } else {
        const qa: ParsedTicketQa = {};

        if (hasOwnKey(qaRaw, "required")) {
          if (typeof qaRaw.required !== "boolean") {
            fieldErrors.push(`${file}: x_ticket.qa.required must be a boolean`);
          } else {
            qa.required = qaRaw.required;
          }
        }

        if (hasOwnKey(qaRaw, "status")) {
          const status = typeof qaRaw.status === "string" ? qaRaw.status.trim() : "";
          if (!status || !isQaStatus(status)) {
            fieldErrors.push(`${file}: x_ticket.qa.status must be one of ${QA_STATUS_ORDER.join(", ")}`);
          } else {
            qa.status = status;
          }
        }

        if (hasOwnKey(qaRaw, "status_reason")) {
          const reason = typeof qaRaw.status_reason === "string" ? qaRaw.status_reason.trim() : "";
          if (!reason) {
            fieldErrors.push(`${file}: x_ticket.qa.status_reason must be a non-empty string when present`);
          } else {
            qa.status_reason = reason;
          }
        }

        if (hasOwnKey(qaRaw, "environment")) {
          const environment = typeof qaRaw.environment === "string" ? qaRaw.environment.trim() : "";
          if (!environment) {
            fieldErrors.push(`${file}: x_ticket.qa.environment must be a non-empty string when present`);
          } else {
            qa.environment = environment;
          }
        }

        if (qa.required === true) {
          if (!qa.status) {
            fieldErrors.push(`${file}: x_ticket.qa.status is required when x_ticket.qa.required=true`);
          }
          if (qa.status === "qa_failed" && !qa.status_reason) {
            fieldErrors.push(`${file}: x_ticket.qa.status_reason is required when x_ticket.qa.status=qa_failed`);
          }
          if ((qa.status === "ready_for_qa" || qa.status === "qa_passed") && !qa.environment) {
            fieldErrors.push(`${file}: x_ticket.qa.environment is required when x_ticket.qa.status=${qa.status}`);
          }
          if (frontmatter.state === "done" && qa.status !== "qa_passed") {
            fieldErrors.push(`${file}: state 'done' requires x_ticket.qa.status=qa_passed when x_ticket.qa.required=true`);
          }
        }

        if (Object.keys(qa).length > 0) {
          frontmatter.qa = qa;
        }
      }
    }
  }

  if (fieldErrors.length > 0) {
    throw new TicketError(
      ERROR_CODE.VALIDATION_FAILED,
      fieldErrors.join("\n"),
      EXIT_CODE.VALIDATION_FAILED,
      { file, errors: fieldErrors }
    );
  }

  return { parsed, frontmatter };
}

export function renderTicketDocument(document: matter.GrayMatterFile<string>): string {
  return matter.stringify(document.content, document.data);
}
