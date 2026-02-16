import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { INDEX_PATH, PRIORITY_ORDER, STATE_ORDER, TICKETS_DIR, type TicketPriority, type TicketState } from "../lib/constants.js";
import type { TicketIndexEntry, TicketsIndex } from "../lib/index.js";
import { shortId, displayId } from "../lib/ulid.js";
import { rebuildIndex } from "../lib/index.js";

export interface ValidateCommandOptions {
  fix?: boolean;
  ci?: boolean;
}

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function isState(value: unknown): value is TicketState {
  return typeof value === "string" && STATE_ORDER.includes(value as TicketState);
}

function isPriority(value: unknown): value is TicketPriority {
  return typeof value === "string" && PRIORITY_ORDER.includes(value as TicketPriority);
}

function stateRank(state: TicketState): number {
  return STATE_ORDER.indexOf(state);
}

function priorityRank(priority: TicketPriority): number {
  return PRIORITY_ORDER.indexOf(priority);
}

function labelsFrom(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((label) => (typeof label === "string" ? label.toLowerCase().trim() : ""))
    .filter(Boolean);
}

function assertRequired(data: Record<string, unknown>, field: string, file: string, errors: string[]): void {
  if (!(field in data)) {
    errors.push(`${file}: missing required field '${field}'`);
  }
}

async function writeTicket(file: string, parsed: matter.GrayMatterFile<string>): Promise<void> {
  const output = matter.stringify(parsed.content, parsed.data);
  await fs.writeFile(file, output, "utf8");
}

function sameIndexShape(actual: TicketsIndex | null, expected: TicketsIndex): boolean {
  if (!actual) return false;
  if (actual.format_version !== expected.format_version) return false;
  if (actual.workflow !== expected.workflow) return false;
  return JSON.stringify(actual.tickets) === JSON.stringify(expected.tickets);
}

async function loadIndex(cwd: string): Promise<TicketsIndex | null> {
  const indexPath = path.join(cwd, INDEX_PATH);
  try {
    const raw = await fs.readFile(indexPath, "utf8");
    return JSON.parse(raw) as TicketsIndex;
  } catch {
    return null;
  }
}

async function buildIndexFromDisk(cwd: string): Promise<TicketsIndex> {
  const ticketsDir = path.join(cwd, TICKETS_DIR);
  await fs.mkdir(ticketsDir, { recursive: true });

  const files = (await fs.readdir(ticketsDir))
    .filter((name) => name.endsWith(".md"))
    .sort((a, b) => a.localeCompare(b));

  const tickets: TicketIndexEntry[] = [];

  for (const file of files) {
    const ticketPath = path.join(ticketsDir, file);
    const parsed = matter(await fs.readFile(ticketPath, "utf8"));
    const id = String(parsed.data.id ?? "").trim();

    tickets.push({
      id,
      short_id: shortId(id),
      display_id: displayId(id),
      title: String(parsed.data.title ?? "").trim(),
      state: parsed.data.state as TicketState,
      priority: parsed.data.priority as TicketPriority,
      labels: labelsFrom(parsed.data.labels),
      path: `${TICKETS_DIR}/${file}`
    });
  }

  tickets.sort((a, b) => {
    const stateDiff = stateRank(a.state) - stateRank(b.state);
    if (stateDiff !== 0) return stateDiff;
    const priorityDiff = priorityRank(a.priority) - priorityRank(b.priority);
    if (priorityDiff !== 0) return priorityDiff;
    return a.id.localeCompare(b.id);
  });

  return {
    format_version: 1,
    generated_at: new Date().toISOString(),
    workflow: "simple-v1",
    tickets
  };
}

export async function runValidate(cwd: string, options: ValidateCommandOptions): Promise<void> {
  const fix = options.fix ?? false;
  const ticketsDir = path.join(cwd, TICKETS_DIR);
  await fs.mkdir(ticketsDir, { recursive: true });
  const files = (await fs.readdir(ticketsDir))
    .filter((name) => name.endsWith(".md"))
    .sort((a, b) => a.localeCompare(b));

  const errors: string[] = [];
  let touchedTicket = false;

  for (const file of files) {
    const ticketPath = path.join(ticketsDir, file);
    const stem = file.replace(/\.md$/, "");

    if (!ULID_RE.test(stem)) {
      errors.push(`${file}: filename must be a valid ULID`);
    }

    let parsed: matter.GrayMatterFile<string>;
    try {
      parsed = matter(await fs.readFile(ticketPath, "utf8"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${file}: invalid YAML frontmatter (${message})`);
      continue;
    }

    const data = parsed.data as Record<string, unknown>;
    assertRequired(data, "title", file, errors);
    assertRequired(data, "state", file, errors);
    assertRequired(data, "priority", file, errors);
    assertRequired(data, "labels", file, errors);
    assertRequired(data, "created", file, errors);
    if (!("updated" in data) && fix) {
      parsed.data.updated = new Date().toISOString();
      await writeTicket(ticketPath, parsed);
      touchedTicket = true;
      data.updated = parsed.data.updated;
    } else {
      assertRequired(data, "updated", file, errors);
    }

    if (typeof data.title !== "string" || !data.title.trim()) {
      errors.push(`${file}: title must be a non-empty string`);
    }

    if (!isState(data.state)) {
      errors.push(`${file}: invalid state '${String(data.state)}'`);
    }

    if (!isPriority(data.priority)) {
      errors.push(`${file}: invalid priority '${String(data.priority)}'`);
    }

    if (!Array.isArray(data.labels) || data.labels.some((label) => typeof label !== "string")) {
      errors.push(`${file}: labels must be an array of strings`);
    }

    if (String(data.id ?? "").trim() !== stem) {
      errors.push(`${file}: id must match filename`);
    }

  }

  const expectedIndex = await buildIndexFromDisk(cwd);
  const index = await loadIndex(cwd);
  const indexStale = !sameIndexShape(index, expectedIndex);

  if (indexStale) {
    if (fix) {
      await rebuildIndex(cwd);
    } else {
      errors.push("index.json is missing, invalid, or stale");
    }
  }

  if (errors.length > 0) {
    throw new Error(`Validation failed:\n- ${errors.join("\n- ")}`);
  }

  if (fix) {
    if (touchedTicket || indexStale) {
      console.log("Validation passed (applied fixes).");
      return;
    }
    console.log("Validation passed (no fixes needed).");
    return;
  }

  console.log("Validation passed.");
}
