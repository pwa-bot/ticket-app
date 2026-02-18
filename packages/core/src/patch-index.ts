/**
 * Index.json Patch Algorithm
 * 
 * Updates a single ticket entry in index.json and re-sorts deterministically.
 * Efficient for GitHub API use - no need to scan all ticket files.
 */

import type { Priority, TicketIndex, TicketIndexEntry, TicketState } from './index.js';
import type { ApiError, IndexPatchResult, TicketChangePatch } from './dashboard-writes.js';
import { PRIORITY_ORDER, STATE_ORDER } from './dashboard-writes.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ErrorResult = { ok: false; error: ApiError };

function error(code: ApiError['code'], message: string, details?: Record<string, unknown>): ErrorResult {
  return { ok: false, error: { code, message, details } };
}

function normalizeLabel(label: string): string {
  return label.toLowerCase().trim();
}

// ---------------------------------------------------------------------------
// Step A: Parse and validate envelope
// ---------------------------------------------------------------------------

type ParseIndexOk = { ok: true; index: TicketIndex };

function parseIndex(rawIndex: string): ParseIndexOk | ErrorResult {
  let idx: unknown;
  try {
    idx = JSON.parse(rawIndex);
  } catch (e) {
    return error('index_invalid_format', `JSON parse error: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!idx || typeof idx !== 'object') {
    return error('index_invalid_format', 'index.json must be an object');
  }

  const obj = idx as Record<string, unknown>;

  if (obj.format_version !== 1) {
    return error('index_invalid_format', `Unsupported format_version: ${obj.format_version}`);
  }

  if (!Array.isArray(obj.tickets)) {
    return error('index_invalid_format', 'index.json must have a tickets array');
  }

  return { ok: true, index: obj as unknown as TicketIndex };
}

// ---------------------------------------------------------------------------
// Step B: Locate ticket entry
// ---------------------------------------------------------------------------

function findTicketEntry(tickets: TicketIndexEntry[], ticketId: string): { entry: TicketIndexEntry; index: number } | null {
  const normalizedId = ticketId.toUpperCase();
  const idx = tickets.findIndex(t => t.id.toUpperCase() === normalizedId);
  if (idx === -1) {
    return null;
  }
  return { entry: tickets[idx], index: idx };
}

// ---------------------------------------------------------------------------
// Step C: Apply patch to entry
// ---------------------------------------------------------------------------

function applyPatchToEntry(entry: TicketIndexEntry, patch: TicketChangePatch): void {
  // State
  if (patch.state !== undefined) {
    entry.state = patch.state.toLowerCase() as TicketState;
  }

  // Priority
  if (patch.priority !== undefined) {
    entry.priority = patch.priority.toLowerCase() as Priority;
  }

  // Labels
  if (patch.clear_labels) {
    entry.labels = [];
  } else if (patch.labels_replace !== undefined) {
    entry.labels = [...new Set(patch.labels_replace.map(normalizeLabel))];
  } else {
    if (patch.labels_remove?.length) {
      const toRemove = new Set(patch.labels_remove.map(normalizeLabel));
      entry.labels = entry.labels.filter(l => !toRemove.has(normalizeLabel(l)));
    }
    if (patch.labels_add?.length) {
      const existing = new Set(entry.labels.map(normalizeLabel));
      for (const label of patch.labels_add) {
        const normalized = normalizeLabel(label);
        if (!existing.has(normalized)) {
          entry.labels.push(normalized);
          existing.add(normalized);
        }
      }
    }
  }

  // Assignee (null removes)
  if (patch.assignee !== undefined) {
    if (patch.assignee === null) {
      delete entry.assignee;
    } else {
      entry.assignee = patch.assignee;
    }
  }

  // Reviewer (null removes)
  if (patch.reviewer !== undefined) {
    if (patch.reviewer === null) {
      delete entry.reviewer;
    } else {
      entry.reviewer = patch.reviewer;
    }
  }

  // Title
  if (patch.title !== undefined) {
    entry.title = patch.title.trim();
  }
}

// ---------------------------------------------------------------------------
// Step E: Deterministic sort
// ---------------------------------------------------------------------------

function getStateRank(state: string): number {
  return STATE_ORDER[state as TicketState] ?? 99;
}

function getPriorityRank(priority: string): number {
  return PRIORITY_ORDER[priority as Priority] ?? 99;
}

function sortTickets(tickets: TicketIndexEntry[]): void {
  tickets.sort((a, b) => {
    // 1. State rank
    const stateRankA = getStateRank(a.state);
    const stateRankB = getStateRank(b.state);
    if (stateRankA !== stateRankB) {
      return stateRankA - stateRankB;
    }

    // 2. Priority rank
    const priorityRankA = getPriorityRank(a.priority);
    const priorityRankB = getPriorityRank(b.priority);
    if (priorityRankA !== priorityRankB) {
      return priorityRankA - priorityRankB;
    }

    // 3. ID lexicographic
    return a.id.localeCompare(b.id);
  });
}

// ---------------------------------------------------------------------------
// Step F: Serialize
// ---------------------------------------------------------------------------

function serializeIndex(index: TicketIndex): string {
  return JSON.stringify(index, null, 2);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export interface PatchIndexArgs {
  rawIndex: string;
  ticketId: string;
  patch: TicketChangePatch;
  /** Optional: override generated_at timestamp (for testing) */
  generatedAt?: string;
}

export function patchIndexJson(args: PatchIndexArgs): IndexPatchResult {
  const { rawIndex, ticketId, patch, generatedAt } = args;

  // Step A: Parse
  const parseResult = parseIndex(rawIndex);
  if (!parseResult.ok) {
    return parseResult;
  }
  const { index } = parseResult;

  // Step B: Locate entry
  const found = findTicketEntry(index.tickets, ticketId);
  if (!found) {
    return error('index_missing_ticket_entry', `Ticket ${ticketId} not found in index.json. Run \`ticket rebuild-index\` and push.`);
  }

  // Step C: Apply patch
  applyPatchToEntry(found.entry, patch);

  // Step D: Update generated_at
  index.generated_at = generatedAt ?? new Date().toISOString();

  // Step E: Sort
  sortTickets(index.tickets);

  // Step F: Serialize
  const content = serializeIndex(index);

  return { ok: true, content };
}
