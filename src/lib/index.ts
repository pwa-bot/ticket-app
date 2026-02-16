import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { INDEX_PATH, TICKETS_DIR, PRIORITY_ORDER, STATE_ORDER, type TicketPriority, type TicketState } from "./constants.js";
import { displayId, shortId } from "./ulid.js";

export interface TicketIndexEntry {
  id: string;
  short_id: string;
  display_id: string;
  title: string;
  state: TicketState;
  priority: TicketPriority;
  labels: string[];
  path: string;
}

export interface TicketsIndex {
  format_version: 1;
  generated_at: string;
  workflow: "simple-v1";
  tickets: TicketIndexEntry[];
}

function isState(value: string): value is TicketState {
  return STATE_ORDER.includes(value as TicketState);
}

function isPriority(value: string): value is TicketPriority {
  return PRIORITY_ORDER.includes(value as TicketPriority);
}

function stateRank(state: TicketState): number {
  return STATE_ORDER.indexOf(state);
}

function priorityRank(priority: TicketPriority): number {
  return PRIORITY_ORDER.indexOf(priority);
}

function ensureString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid ticket frontmatter: ${field} must be a non-empty string`);
  }
  return value.trim();
}

function ensureLabels(value: unknown): string[] {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error("Invalid ticket frontmatter: labels must be an array");
  }
  return value.map((label) => {
    if (typeof label !== "string") {
      throw new Error("Invalid ticket frontmatter: labels must contain only strings");
    }
    return label.toLowerCase().trim();
  }).filter(Boolean);
}

export async function rebuildIndex(cwd: string): Promise<TicketsIndex> {
  const ticketsDir = path.join(cwd, TICKETS_DIR);
  await fs.mkdir(ticketsDir, { recursive: true });

  const files = (await fs.readdir(ticketsDir))
    .filter((name) => name.endsWith(".md"))
    .sort((a, b) => a.localeCompare(b));

  const entries: TicketIndexEntry[] = [];

  for (const file of files) {
    const fullPath = path.join(ticketsDir, file);
    const markdown = await fs.readFile(fullPath, "utf8");
    const parsed = matter(markdown);

    const stem = file.replace(/\.md$/, "");
    const id = ensureString(parsed.data.id, "id");
    const title = ensureString(parsed.data.title, "title");
    const state = ensureString(parsed.data.state, "state");
    const priority = ensureString(parsed.data.priority, "priority");
    const labels = ensureLabels(parsed.data.labels);

    if (id !== stem) {
      throw new Error(`Ticket id does not match filename for ${file}`);
    }
    if (!isState(state)) {
      throw new Error(`Invalid state '${state}' in ${file}`);
    }
    if (!isPriority(priority)) {
      throw new Error(`Invalid priority '${priority}' in ${file}`);
    }

    entries.push({
      id,
      short_id: shortId(id),
      display_id: displayId(id),
      title,
      state,
      priority,
      labels,
      path: `${TICKETS_DIR}/${file}`
    });
  }

  entries.sort((a, b) => {
    const stateDiff = stateRank(a.state) - stateRank(b.state);
    if (stateDiff !== 0) return stateDiff;

    const priorityDiff = priorityRank(a.priority) - priorityRank(b.priority);
    if (priorityDiff !== 0) return priorityDiff;

    return a.id.localeCompare(b.id);
  });

  const index: TicketsIndex = {
    format_version: 1,
    generated_at: new Date().toISOString(),
    workflow: "simple-v1",
    tickets: entries
  };

  await fs.writeFile(path.join(cwd, INDEX_PATH), `${JSON.stringify(index, null, 2)}\n`, "utf8");
  return index;
}
