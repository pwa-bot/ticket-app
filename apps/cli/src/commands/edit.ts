import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { INDEX_PATH, PRIORITY_ORDER, type TicketPriority } from "../lib/constants.js";
import { autoCommit } from "../lib/git.js";
import { rebuildIndex } from "../lib/index.js";
import { readIndex } from "../lib/io.js";
import { resolveTicket } from "../lib/resolve.js";

export interface EditCommandOptions {
  title?: string;
  priority?: string;
  labels?: string[];
  ci?: boolean;
}

interface LabelChange {
  mode: "replace" | "add" | "remove";
  labels: string[];
}

function normalizePriority(priority: string): TicketPriority {
  if (!PRIORITY_ORDER.includes(priority as TicketPriority)) {
    throw new Error(`Invalid priority '${priority}'. Allowed: ${PRIORITY_ORDER.join(", ")}`);
  }
  return priority as TicketPriority;
}

function parseLabelValues(values: string[]): LabelChange[] {
  const changes: LabelChange[] = [];

  for (const raw of values) {
    const value = raw.trim();
    if (!value) {
      continue;
    }

    if (value.startsWith("+")) {
      const label = value.slice(1).trim().toLowerCase();
      if (!label) {
        throw new Error("Invalid --labels value: '+<label>' requires a non-empty label");
      }
      changes.push({ mode: "add", labels: [label] });
      continue;
    }

    if (value.startsWith("-")) {
      const label = value.slice(1).trim().toLowerCase();
      if (!label) {
        throw new Error("Invalid --labels value: '-<label>' requires a non-empty label");
      }
      changes.push({ mode: "remove", labels: [label] });
      continue;
    }

    const labels = value
      .split(",")
      .map((label) => label.toLowerCase().trim())
      .filter(Boolean);
    changes.push({ mode: "replace", labels });
  }

  return changes;
}

function applyLabelChanges(currentLabels: string[], changes: LabelChange[]): { labels: string[]; changed: boolean } {
  let labels = [...currentLabels];
  let changed = false;

  for (const change of changes) {
    if (change.mode === "replace") {
      const next = [...new Set(change.labels)];
      if (JSON.stringify(next) !== JSON.stringify(labels)) {
        labels = next;
        changed = true;
      }
      continue;
    }

    if (change.mode === "add") {
      for (const label of change.labels) {
        if (!labels.includes(label)) {
          labels.push(label);
          changed = true;
        }
      }
      continue;
    }

    const before = labels.length;
    labels = labels.filter((label) => !change.labels.includes(label));
    if (labels.length !== before) {
      changed = true;
    }
  }

  return { labels, changed };
}

function toLabelArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((label) => (typeof label === "string" ? label.toLowerCase().trim() : ""))
    .filter(Boolean);
}

function formatEditSummary(changes: string[]): string {
  return changes.join(", ");
}

export async function runEdit(cwd: string, id: string, options: EditCommandOptions): Promise<void> {
  const index = await readIndex(cwd);
  const ticket = resolveTicket(index, id, options.ci ?? false);
  const ticketPath = path.join(cwd, ticket.path);

  const markdown = await fs.readFile(ticketPath, "utf8");
  const parsed = matter(markdown);

  const changes: string[] = [];

  if (options.title != null) {
    const title = options.title.trim();
    if (!title) {
      throw new Error("Title must be non-empty");
    }
    if (parsed.data.title !== title) {
      parsed.data.title = title;
      changes.push("title");
    }
  }

  if (options.priority != null) {
    const priority = normalizePriority(options.priority);
    if (parsed.data.priority !== priority) {
      parsed.data.priority = priority;
      changes.push("priority");
    }
  }

  if ((options.labels ?? []).length > 0) {
    const labelChanges = parseLabelValues(options.labels ?? []);
    const currentLabels = toLabelArray(parsed.data.labels);
    const next = applyLabelChanges(currentLabels, labelChanges);
    if (next.changed) {
      parsed.data.labels = next.labels;
      changes.push("labels");
    }
  }

  if (changes.length === 0) {
    throw new Error("No changes to apply");
  }

  parsed.data.updated = new Date().toISOString();
  const output = matter.stringify(parsed.content, parsed.data);
  await fs.writeFile(ticketPath, output, "utf8");

  await rebuildIndex(cwd);
  const indexPath = path.join(cwd, INDEX_PATH);

  try {
    await autoCommit(cwd, [ticketPath, indexPath], `edit(${ticket.display_id}): ${formatEditSummary(changes)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Warning: git auto-commit failed: ${message}`);
  }

  console.log(`Edited ${ticket.display_id}: ${formatEditSummary(changes)}`);
}
