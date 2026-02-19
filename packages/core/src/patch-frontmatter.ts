import YAML from "yaml";
import { err } from "./errors.js";
import {
  normalizeLabels,
  normalizePriority,
  normalizeState,
  isValidTransition,
  getAllowedTransitions,
  validateActorRef,
  type TicketState,
  type TicketPriority,
} from "./protocol.js";
import type { TicketChangePatch } from "./types.js";

export function patchTicketFrontmatter(args: {
  ticketPath: string;
  rawTicket: string;
  patch: TicketChangePatch;
}): string {
  const { yamlText, bodyText } = splitFrontmatter(args.rawTicket);

  let fm: Record<string, unknown>;
  try {
    fm = YAML.parse(yamlText) as Record<string, unknown>;
  } catch (e: unknown) {
    throw err("frontmatter_invalid_yaml", "Invalid YAML frontmatter", { ticketPath: args.ticketPath });
  }

  // Validate required fields
  const required = ["id", "title", "state", "priority", "labels"];
  for (const k of required) {
    if (!(k in fm)) {
      throw err("frontmatter_invalid_required_fields", `Missing required field '${k}'`, {
        ticketPath: args.ticketPath,
      });
    }
  }
  if (!Array.isArray(fm.labels)) {
    throw err("frontmatter_invalid_required_fields", "labels must be an array", { ticketPath: args.ticketPath });
  }

  // Normalize current state/priority for validation
  const curState = safeNormalizeState(fm.state, args.ticketPath);
  const _curPriority = safeNormalizePriority(fm.priority, args.ticketPath);

  // Apply patch: state
  if (args.patch.state) {
    const nextState = safeNormalizeState(args.patch.state, args.ticketPath);
    if (!isValidTransition(curState, nextState)) {
      const suggestions = getAllowedTransitions(curState);
      throw err("invalid_transition", `Invalid transition: ${curState} → ${nextState}`, {
        from: curState,
        to: nextState,
        suggestions,
      });
    }
    fm.state = nextState;
  }

  // Apply patch: priority
  if (args.patch.priority) {
    const nextPriority = safeNormalizePriority(args.patch.priority, args.ticketPath);
    fm.priority = nextPriority;
  }

  // Apply patch: title
  if (args.patch.title !== undefined) {
    const t = String(args.patch.title).trim();
    if (!t) {
      throw err("frontmatter_invalid_required_fields", "title must be non-empty", { ticketPath: args.ticketPath });
    }
    fm.title = t;
  }

  // Apply patch: labels
  const hasReplace = !!args.patch.labels_replace?.length;
  const hasPatchOps = !!(args.patch.labels_add?.length || args.patch.labels_remove?.length || args.patch.clear_labels);

  if (hasReplace && hasPatchOps) {
    throw err("invalid_labels_patch", "Cannot mix labels_replace with labels_add/remove/clear", {});
  }

  if (args.patch.clear_labels) {
    fm.labels = [];
  } else if (hasReplace) {
    fm.labels = normalizeLabels(args.patch.labels_replace ?? []);
  } else if (args.patch.labels_add || args.patch.labels_remove) {
    const existing = Array.isArray(fm.labels) ? (fm.labels as string[]).map(String) : [];
    let next = normalizeLabels(existing);
    const add = args.patch.labels_add ? normalizeLabels(args.patch.labels_add) : [];
    const remove = args.patch.labels_remove ? normalizeLabels(args.patch.labels_remove) : [];
    const removeSet = new Set(remove);
    next = next.filter((l) => !removeSet.has(l));
    for (const a of add) {
      if (!next.includes(a)) next.push(a);
    }
    fm.labels = next;
  }

  // Apply patch: assignee/reviewer
  if (args.patch.assignee !== undefined) {
    if (args.patch.assignee === null) {
      delete fm.assignee;
    } else {
      const v = String(args.patch.assignee);
      try {
        validateActorRef(v);
      } catch {
        throw err("invalid_actor", `Invalid assignee: ${v}`, {});
      }
      fm.assignee = v.toLowerCase();
    }
  }

  if (args.patch.reviewer !== undefined) {
    if (args.patch.reviewer === null) {
      delete fm.reviewer;
    } else {
      const v = String(args.patch.reviewer);
      try {
        validateActorRef(v);
      } catch {
        throw err("invalid_actor", `Invalid reviewer: ${v}`, {});
      }
      fm.reviewer = v.toLowerCase();
    }
  }

  // YAML stringify with stable key ordering
  const ordered = orderFrontmatterKeys(fm);
  const newYaml = YAML.stringify(ordered, { indent: 2, lineWidth: 0 }).trimEnd();

  return `---\n${newYaml}\n---\n${bodyText}`;
}

function splitFrontmatter(raw: string): { yamlText: string; bodyText: string } {
  const starts = raw.startsWith("---\n") || raw.startsWith("---\r\n");
  if (!starts) {
    throw err("frontmatter_missing", "Frontmatter must start at first line with ---", {});
  }

  const m = raw.match(/^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n)([\s\S]*)$/);
  if (!m) {
    throw err("frontmatter_missing", "Frontmatter closing delimiter --- not found", {});
  }

  return { yamlText: m[2], bodyText: m[4] };
}

function safeNormalizeState(v: unknown, ticketPath: string): TicketState {
  try {
    return normalizeState(String(v));
  } catch {
    throw err("invalid_state", `Invalid state: ${String(v)}`, { ticketPath });
  }
}

function safeNormalizePriority(v: unknown, ticketPath: string): TicketPriority {
  try {
    return normalizePriority(String(v));
  } catch {
    throw err("invalid_priority", `Invalid priority: ${String(v)}`, { ticketPath });
  }
}

function orderFrontmatterKeys(fm: Record<string, unknown>): Record<string, unknown> {
  const known = ["id", "title", "state", "priority", "labels", "assignee", "reviewer", "x_ticket"];
  const out: Record<string, unknown> = {};
  for (const k of known) {
    if (k in fm) out[k] = fm[k];
  }
  const restKeys = Object.keys(fm)
    .filter((k) => !known.includes(k))
    .sort();
  for (const k of restKeys) out[k] = fm[k];
  return out;
}
