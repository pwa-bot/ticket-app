import { err } from "./errors.js";
import {
  STATE_ORDER,
  PRIORITY_ORDER,
  normalizeLabels,
  type TicketState,
  type TicketPriority,
} from "./protocol.js";
import type { TicketChangePatch } from "./types.js";

type IndexEnvelope = {
  format_version: number;
  generated_at: string;
  workflow: string;
  tickets: TicketEntry[];
  [k: string]: unknown;
};

type TicketEntry = {
  id: string;
  short_id: string;
  display_id: string;
  title: string;
  state: string;
  priority: string;
  labels: string[];
  path: string;
  assignee?: string;
  reviewer?: string;
  [k: string]: unknown;
};

const stateRank = new Map<TicketState, number>(STATE_ORDER.map((s, i) => [s, i]));
const priorityRank = new Map<TicketPriority, number>(PRIORITY_ORDER.map((p, i) => [p, i]));

export function patchIndexJson(args: {
  rawIndex: string;
  ticketId: string;
  patch: TicketChangePatch;
  now?: Date;
}): string {
  let idx: IndexEnvelope;
  try {
    idx = JSON.parse(args.rawIndex) as IndexEnvelope;
  } catch {
    throw err("index_invalid_format", "index.json is not valid JSON", {});
  }

  if (idx.format_version !== 1 || !Array.isArray(idx.tickets)) {
    throw err("index_invalid_format", "index.json envelope invalid", {});
  }

  const idUpper = args.ticketId.toUpperCase();
  const entry = idx.tickets.find((t) => String(t.id).toUpperCase() === idUpper);

  if (!entry) {
    throw err("index_missing_ticket_entry", "index.json missing ticket entry", { ticketId: args.ticketId });
  }

  // Apply patch to entry
  if (args.patch.state) {
    entry.state = String(args.patch.state).toLowerCase();
  }
  if (args.patch.priority) {
    entry.priority = String(args.patch.priority).toLowerCase();
  }

  // Labels
  const hasReplace = !!args.patch.labels_replace?.length;
  const hasPatchOps = !!(args.patch.labels_add?.length || args.patch.labels_remove?.length || args.patch.clear_labels);

  if (hasReplace && hasPatchOps) {
    throw err("invalid_labels_patch", "Cannot mix labels_replace with labels_add/remove/clear", {});
  }

  if (args.patch.clear_labels) {
    entry.labels = [];
  } else if (hasReplace) {
    entry.labels = normalizeLabels(args.patch.labels_replace ?? []);
  } else if (args.patch.labels_add || args.patch.labels_remove) {
    const existing = Array.isArray(entry.labels) ? entry.labels.map(String) : [];
    let next = normalizeLabels(existing);
    const add = args.patch.labels_add ? normalizeLabels(args.patch.labels_add) : [];
    const remove = args.patch.labels_remove ? normalizeLabels(args.patch.labels_remove) : [];
    const removeSet = new Set(remove);
    next = next.filter((l) => !removeSet.has(l));
    for (const a of add) {
      if (!next.includes(a)) next.push(a);
    }
    entry.labels = next;
  }

  // Assignee/reviewer
  if (args.patch.assignee !== undefined) {
    if (args.patch.assignee === null) {
      delete entry.assignee;
    } else {
      entry.assignee = args.patch.assignee;
    }
  }
  if (args.patch.reviewer !== undefined) {
    if (args.patch.reviewer === null) {
      delete entry.reviewer;
    } else {
      entry.reviewer = args.patch.reviewer;
    }
  }

  // Title
  if (args.patch.title !== undefined) {
    entry.title = String(args.patch.title).trim();
  }

  // Update generated_at
  const now = args.now ?? new Date();
  idx.generated_at = now.toISOString();

  // Re-sort deterministically
  idx.tickets.sort(compareTickets);

  return JSON.stringify(idx, null, 2) + "\n";
}

function compareTickets(a: TicketEntry, b: TicketEntry): number {
  const as = String(a.state).toLowerCase() as TicketState;
  const bs = String(b.state).toLowerCase() as TicketState;
  const ap = String(a.priority).toLowerCase() as TicketPriority;
  const bp = String(b.priority).toLowerCase() as TicketPriority;

  const ar = stateRank.get(as) ?? 999;
  const br = stateRank.get(bs) ?? 999;
  if (ar !== br) return ar - br;

  const apr = priorityRank.get(ap) ?? 999;
  const bpr = priorityRank.get(bp) ?? 999;
  if (apr !== bpr) return apr - bpr;

  return String(a.id).localeCompare(String(b.id));
}
