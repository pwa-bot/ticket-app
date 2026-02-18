import matter from "gray-matter";
import { PRIORITY_ORDER, STATE_ORDER, type TicketPriority, type TicketState } from "./constants.js";
import { ERROR_CODE, EXIT_CODE, TicketError } from "./errors.js";

export interface ParsedTicketFrontmatter {
  id: string;
  title: string;
  state: TicketState;
  priority: TicketPriority;
  labels: string[];
  created?: string;
  assignee?: string;
  reviewer?: string;
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

  const id = typeof parsed.data.id === "string" && parsed.data.id.trim()
    ? parsed.data.id.trim()
    : "";
  if (!id) fieldErrors.push(`${file}: id must be a non-empty string`);

  const title = typeof parsed.data.title === "string" && parsed.data.title.trim()
    ? parsed.data.title.trim()
    : "";
  if (!title) fieldErrors.push(`${file}: title must be a non-empty string`);

  const stateRaw = typeof parsed.data.state === "string" && parsed.data.state.trim()
    ? parsed.data.state.trim().toLowerCase()
    : "";
  if (!stateRaw) {
    fieldErrors.push(`${file}: state must be a non-empty string`);
  } else if (!isState(stateRaw)) {
    fieldErrors.push(`${file}: invalid state '${stateRaw}'`);
  }

  const priorityRaw = typeof parsed.data.priority === "string" && parsed.data.priority.trim()
    ? parsed.data.priority.trim().toLowerCase()
    : "";
  if (!priorityRaw) {
    fieldErrors.push(`${file}: priority must be a non-empty string`);
  } else if (!isPriority(priorityRaw)) {
    fieldErrors.push(`${file}: invalid priority '${priorityRaw}'`);
  }

  let labels: string[] = [];
  if (!Array.isArray(parsed.data.labels) || parsed.data.labels.some((entry) => typeof entry !== "string")) {
    fieldErrors.push(`${file}: labels must be an array of strings`);
  } else {
    labels = [...new Set(parsed.data.labels.map((entry) => entry.toLowerCase().trim()).filter(Boolean))];
  }

  if (expectedId && id && id !== expectedId) {
    fieldErrors.push(`${file}: id must match filename`);
  }

  if (fieldErrors.length > 0) {
    throw new TicketError(
      ERROR_CODE.VALIDATION_FAILED,
      fieldErrors.join("\n"),
      EXIT_CODE.VALIDATION_FAILED,
      { file, errors: fieldErrors }
    );
  }

  const frontmatter: ParsedTicketFrontmatter = {
    id,
    title,
    state: stateRaw as TicketState,
    priority: priorityRaw as TicketPriority,
    labels,
    created: parseCreated(parsed.data.created)
  };

  if (typeof parsed.data.assignee === "string" && parsed.data.assignee.trim()) {
    frontmatter.assignee = parsed.data.assignee.trim();
  }
  if (typeof parsed.data.reviewer === "string" && parsed.data.reviewer.trim()) {
    frontmatter.reviewer = parsed.data.reviewer.trim();
  }

  return { parsed, frontmatter };
}

export function renderTicketDocument(document: matter.GrayMatterFile<string>): string {
  return matter.stringify(document.content, document.data);
}
