import { promises as fs } from "node:fs";
import path from "node:path";
import { INDEX_PATH, TICKETS_DIR, TICKETS_ROOT, PRIORITY_ORDER, type TicketPriority, type TicketState } from "./constants.js";
import { ERROR_CODE, EXIT_CODE, TicketError } from "./errors.js";
import { parseTicketDocument } from "./parse.js";
import { displayId, shortId } from "./ulid.js";

export interface TicketIndexEntry {
  id: string;
  short_id: string;
  display_id: string;
  title: string;
  state: TicketState;
  priority: TicketPriority;
  labels: string[];
  created?: string;
  assignee?: string;
  reviewer?: string;
  path: string;
}

export interface TicketsIndex {
  format_version: 1;
  generated_at: string;
  workflow: "simple-v1";
  tickets: TicketIndexEntry[];
}

function priorityRank(priority: TicketPriority): number {
  return PRIORITY_ORDER.indexOf(priority);
}

function isValidIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function createdValue(ticket: Pick<TicketIndexEntry, "created" | "id">): string {
  if (isValidIsoDate(ticket.created)) {
    return new Date(ticket.created).toISOString();
  }
  return "";
}

export function compareTicketsDeterministic(a: Pick<TicketIndexEntry, "priority" | "created" | "id">, b: Pick<TicketIndexEntry, "priority" | "created" | "id">): number {
  const priorityDiff = priorityRank(a.priority) - priorityRank(b.priority);
  if (priorityDiff !== 0) return priorityDiff;

  const aCreated = createdValue(a);
  const bCreated = createdValue(b);
  if (aCreated && bCreated) {
    const createdDiff = aCreated.localeCompare(bCreated);
    if (createdDiff !== 0) return createdDiff;
  } else if (aCreated || bCreated) {
    return aCreated ? -1 : 1;
  }

  return a.id.localeCompare(b.id);
}

export function sortTicketsDeterministic<T extends Pick<TicketIndexEntry, "priority" | "created" | "id">>(tickets: T[]): T[] {
  return [...tickets].sort(compareTicketsDeterministic);
}

async function listTicketFiles(cwd: string): Promise<string[]> {
  const ticketsDir = path.join(cwd, TICKETS_DIR);
  await fs.mkdir(ticketsDir, { recursive: true });
  return (await fs.readdir(ticketsDir))
    .filter((name) => name.endsWith(".md"))
    .sort((a, b) => a.localeCompare(b));
}

export async function generateIndex(cwd: string): Promise<TicketsIndex> {
  const files = await listTicketFiles(cwd);
  const tickets: TicketIndexEntry[] = [];

  for (const file of files) {
    const fullPath = path.join(cwd, TICKETS_DIR, file);
    const markdown = await fs.readFile(fullPath, "utf8");
    const stem = file.replace(/\.md$/, "");
    const parsed = parseTicketDocument(markdown, file, stem);

    tickets.push({
      id: parsed.frontmatter.id,
      short_id: shortId(parsed.frontmatter.id),
      display_id: displayId(parsed.frontmatter.id),
      title: parsed.frontmatter.title,
      state: parsed.frontmatter.state,
      priority: parsed.frontmatter.priority,
      labels: parsed.frontmatter.labels,
      created: parsed.frontmatter.created,
      assignee: parsed.frontmatter.assignee,
      reviewer: parsed.frontmatter.reviewer,
      path: `${TICKETS_DIR}/${file}`
    });
  }

  return {
    format_version: 1,
    generated_at: new Date().toISOString(),
    workflow: "simple-v1",
    tickets: sortTicketsDeterministic(tickets)
  };
}

export async function rebuildIndex(cwd: string): Promise<TicketsIndex> {
  const index = await generateIndex(cwd);
  await fs.mkdir(path.join(cwd, TICKETS_ROOT), { recursive: true });
  await fs.writeFile(path.join(cwd, INDEX_PATH), `${JSON.stringify(index, null, 2)}\n`, "utf8");
  return index;
}

export async function loadIndexFromDisk(cwd: string): Promise<TicketsIndex | null> {
  try {
    const raw = await fs.readFile(path.join(cwd, INDEX_PATH), "utf8");
    return JSON.parse(raw) as TicketsIndex;
  } catch {
    return null;
  }
}

async function hasTicketsRoot(cwd: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path.join(cwd, TICKETS_ROOT));
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export async function readOrRecoverIndex(cwd: string): Promise<TicketsIndex> {
  try {
    const raw = await fs.readFile(path.join(cwd, INDEX_PATH), "utf8");
    const parsed = JSON.parse(raw) as TicketsIndex;
    if (!parsed || !Array.isArray(parsed.tickets)) {
      throw new Error("index shape is invalid");
    }
    return parsed;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : "";
    if (code === "ENOENT" && !(await hasTicketsRoot(cwd))) {
      throw new TicketError(
        ERROR_CODE.NOT_INITIALIZED,
        "Ticket system not initialized. Run `ticket init`.",
        EXIT_CODE.NOT_INITIALIZED,
        { path: INDEX_PATH }
      );
    }
    return rebuildIndex(cwd);
  }
}
