import { promises as fs } from "node:fs";
import path from "node:path";
import { INDEX_PATH, TICKETS_DIR, TICKETS_ROOT, PRIORITY_ORDER, STATE_ORDER, type TicketPriority, type TicketState } from "./constants.js";
import { ERROR_CODE, EXIT_CODE, TicketError } from "./errors.js";
import { parseTicketDocument, type QaStatus } from "./parse.js";
import { displayId, now, shortId } from "./ulid.js";

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
  qa_required?: boolean;
  qa_status?: QaStatus;
  path: string;
}

export interface TicketsIndex {
  format_version: 1;
  generated_at: string;
  workflow: "simple-v1";
  tickets: TicketIndexEntry[];
}

function stateRank(state: TicketState): number {
  return STATE_ORDER.indexOf(state);
}

function priorityRank(priority: TicketPriority): number {
  return PRIORITY_ORDER.indexOf(priority);
}

/**
 * Deterministic comparison for tickets.
 * Order: state (backlog → done), then priority (p0 → p3), then ID lexicographic.
 * This ensures stable, diff-friendly output across runs.
 */
export function compareTicketsDeterministic(
  a: Pick<TicketIndexEntry, "state" | "priority" | "id">,
  b: Pick<TicketIndexEntry, "state" | "priority" | "id">
): number {
  // 1. State order: backlog, ready, in_progress, blocked, done
  const stateDiff = stateRank(a.state) - stateRank(b.state);
  if (stateDiff !== 0) return stateDiff;

  // 2. Priority order: p0, p1, p2, p3
  const priorityDiff = priorityRank(a.priority) - priorityRank(b.priority);
  if (priorityDiff !== 0) return priorityDiff;

  // 3. ID lexicographic (ULIDs sort chronologically)
  return a.id.localeCompare(b.id);
}

export function sortTicketsDeterministic<T extends Pick<TicketIndexEntry, "state" | "priority" | "id">>(tickets: T[]): T[] {
  return [...tickets].sort(compareTicketsDeterministic);
}

async function listTicketFiles(cwd: string): Promise<string[]> {
  const ticketsDir = path.join(cwd, TICKETS_DIR);
  await fs.mkdir(ticketsDir, { recursive: true });
  return (await fs.readdir(ticketsDir))
    .filter((name) => name.endsWith(".md"))
    .sort((a, b) => a.localeCompare(b));
}

function assignDisplayIdsDeterministic(entries: Array<{ id: string; short_id: string }>): Map<string, string> {
  const grouped = new Map<string, string[]>();
  for (const entry of entries) {
    const group = grouped.get(entry.short_id);
    if (group) {
      group.push(entry.id);
      continue;
    }
    grouped.set(entry.short_id, [entry.id]);
  }

  const byId = new Map<string, string>();
  for (const ids of grouped.values()) {
    const sorted = [...ids].sort((a, b) => a.localeCompare(b));
    if (sorted.length === 1) {
      byId.set(sorted[0], displayId(sorted[0]));
      continue;
    }
    for (let idx = 0; idx < sorted.length; idx += 1) {
      byId.set(sorted[idx], displayId(sorted[idx], idx + 1));
    }
  }

  return byId;
}

export async function generateIndex(cwd: string): Promise<TicketsIndex> {
  const files = await listTicketFiles(cwd);
  const ticketDrafts: Array<Omit<TicketIndexEntry, "display_id">> = [];

  for (const file of files) {
    const fullPath = path.join(cwd, TICKETS_DIR, file);
    const markdown = await fs.readFile(fullPath, "utf8");
    const stem = file.replace(/\.md$/, "");
    const parsed = parseTicketDocument(markdown, file, stem);

    ticketDrafts.push({
      id: parsed.frontmatter.id,
      short_id: shortId(parsed.frontmatter.id),
      title: parsed.frontmatter.title,
      state: parsed.frontmatter.state,
      priority: parsed.frontmatter.priority,
      labels: parsed.frontmatter.labels,
      created: parsed.frontmatter.created,
      assignee: parsed.frontmatter.assignee,
      reviewer: parsed.frontmatter.reviewer,
      ...(typeof parsed.frontmatter.qa?.required === "boolean"
        ? { qa_required: parsed.frontmatter.qa.required }
        : {}),
      ...(parsed.frontmatter.qa?.status ? { qa_status: parsed.frontmatter.qa.status } : {}),
      path: `${TICKETS_DIR}/${file}`
    });
  }

  const displayById = assignDisplayIdsDeterministic(ticketDrafts);
  const tickets: TicketIndexEntry[] = ticketDrafts.map((ticket) => ({
    ...ticket,
    display_id: displayById.get(ticket.id) ?? displayId(ticket.id)
  }));

  return {
    format_version: 1,
    generated_at: now().toISOString(),
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
