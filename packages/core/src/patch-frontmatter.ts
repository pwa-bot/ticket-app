/**
 * Frontmatter Patch Algorithm
 * 
 * Applies a patch to a ticket file's YAML frontmatter while:
 * - Preserving unknown keys
 * - Preserving x_ticket object
 * - Preserving markdown body exactly
 * - Validating state transitions
 */

import * as yaml from 'yaml';
import type { Actor, Priority, TicketState } from './index.js';
import { isValidTransition, STATE_TRANSITIONS } from './index.js';
import type { ApiError, FrontmatterPatchResult, TicketChangePatch } from './dashboard-writes.js';
import { FRONTMATTER_KEY_ORDER } from './dashboard-writes.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedFrontmatter {
  id: string;
  title: string;
  state: TicketState;
  priority: Priority;
  labels: string[];
  assignee?: Actor;
  reviewer?: Actor;
  x_ticket?: Record<string, unknown>;
  [key: string]: unknown; // Unknown keys preserved
}

interface ParseResult {
  frontmatter: ParsedFrontmatter;
  body: string;
  yamlRaw: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ErrorResult = { ok: false; error: ApiError };

function error(code: ApiError['code'], message: string, details?: Record<string, unknown>): ErrorResult {
  return { ok: false, error: { code, message, details } };
}

const VALID_STATES: TicketState[] = ['backlog', 'ready', 'in_progress', 'blocked', 'done'];
const VALID_PRIORITIES: Priority[] = ['p0', 'p1', 'p2', 'p3'];
const ACTOR_REGEX = /^(human|agent):[a-z0-9_-]+$/i;

function isValidState(s: unknown): s is TicketState {
  return typeof s === 'string' && VALID_STATES.includes(s as TicketState);
}

function isValidPriority(p: unknown): p is Priority {
  return typeof p === 'string' && VALID_PRIORITIES.includes(p.toLowerCase() as Priority);
}

function isValidActor(a: unknown): a is Actor {
  return typeof a === 'string' && ACTOR_REGEX.test(a);
}

function normalizeLabel(label: string): string {
  return label.toLowerCase().trim();
}

// ---------------------------------------------------------------------------
// Step A: Parse frontmatter
// ---------------------------------------------------------------------------

type ParseResultOk = { ok: true; frontmatter: ParsedFrontmatter; body: string; yamlRaw: string };

function parseFrontmatter(rawTicket: string): ParseResultOk | ErrorResult {
  // Check for opening delimiter
  if (!rawTicket.startsWith('---\n') && !rawTicket.startsWith('---\r\n')) {
    return error('frontmatter_missing', 'File must start with --- frontmatter delimiter');
  }

  // Find closing delimiter
  const closingMatch = rawTicket.match(/\r?\n---\r?\n/);
  if (!closingMatch || closingMatch.index === undefined) {
    return error('frontmatter_missing', 'Could not find closing --- frontmatter delimiter');
  }

  const openingLen = rawTicket.startsWith('---\r\n') ? 5 : 4;
  const yamlRaw = rawTicket.slice(openingLen, closingMatch.index);
  const body = rawTicket.slice(closingMatch.index + closingMatch[0].length);

  // Parse YAML
  let frontmatter: ParsedFrontmatter;
  try {
    frontmatter = yaml.parse(yamlRaw) as ParsedFrontmatter;
  } catch (e) {
    return error('frontmatter_invalid_yaml', `YAML parse error: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!frontmatter || typeof frontmatter !== 'object') {
    return error('frontmatter_invalid_yaml', 'Frontmatter must be a YAML object');
  }

  return { ok: true, frontmatter, body, yamlRaw };
}

// ---------------------------------------------------------------------------
// Step B: Validate required keys
// ---------------------------------------------------------------------------

function validateRequiredKeys(fm: ParsedFrontmatter, ticketPath: string): ErrorResult | null {
  const requiredKeys = ['id', 'title', 'state', 'priority', 'labels'];
  const missing = requiredKeys.filter(k => !(k in fm));
  
  if (missing.length > 0) {
    return error('frontmatter_invalid_required_fields', `Missing required keys: ${missing.join(', ')}`);
  }

  if (!Array.isArray(fm.labels)) {
    return error('frontmatter_invalid_required_fields', 'labels must be an array');
  }

  // Extract ULID from path and validate match
  const pathMatch = ticketPath.match(/([A-Z0-9]{26})\.md$/i);
  if (pathMatch) {
    const pathUlid = pathMatch[1].toUpperCase();
    const fmUlid = String(fm.id).toUpperCase();
    if (pathUlid !== fmUlid) {
      return error('frontmatter_invalid_required_fields', `id mismatch: frontmatter has ${fmUlid}, filename has ${pathUlid}`);
    }
  }

  return null; // Valid
}

// ---------------------------------------------------------------------------
// Step C: Validate patch against protocol
// ---------------------------------------------------------------------------

function validatePatch(fm: ParsedFrontmatter, patch: TicketChangePatch): ErrorResult | null {
  // Validate state transition
  if (patch.state !== undefined) {
    if (!isValidState(patch.state)) {
      return error('invalid_state', `Invalid state: ${patch.state}. Valid: ${VALID_STATES.join(', ')}`);
    }
    if (!isValidTransition(fm.state, patch.state)) {
      const allowed = STATE_TRANSITIONS[fm.state];
      return error('invalid_transition', `Invalid transition: ${fm.state} → ${patch.state}. Allowed from ${fm.state}: ${allowed.join(', ') || 'none'}`);
    }
  }

  // Validate priority
  if (patch.priority !== undefined && !isValidPriority(patch.priority)) {
    return error('invalid_priority', `Invalid priority: ${patch.priority}. Valid: ${VALID_PRIORITIES.join(', ')}`);
  }

  // Validate labels patch mode (can't mix modes)
  const labelModes = [
    patch.labels_replace !== undefined,
    patch.labels_add !== undefined || patch.labels_remove !== undefined,
    patch.clear_labels === true,
  ].filter(Boolean).length;

  if (labelModes > 1) {
    return error('invalid_labels_patch', 'Cannot mix label patch modes (replace, add/remove, clear)');
  }

  // Validate individual labels (no spaces)
  const allLabels = [
    ...(patch.labels_replace ?? []),
    ...(patch.labels_add ?? []),
    ...(patch.labels_remove ?? []),
  ];
  for (const label of allLabels) {
    if (label.includes(' ')) {
      return error('invalid_label', `Label cannot contain spaces: "${label}"`);
    }
  }

  // Validate actors
  if (patch.assignee !== undefined && patch.assignee !== null && !isValidActor(patch.assignee)) {
    return error('invalid_actor', `Invalid assignee format: ${patch.assignee}. Expected human:<slug> or agent:<slug>`);
  }
  if (patch.reviewer !== undefined && patch.reviewer !== null && !isValidActor(patch.reviewer)) {
    return error('invalid_actor', `Invalid reviewer format: ${patch.reviewer}. Expected human:<slug> or agent:<slug>`);
  }

  return null; // Valid
}

// ---------------------------------------------------------------------------
// Step D: Apply patch to frontmatter object
// ---------------------------------------------------------------------------

function applyPatch(fm: ParsedFrontmatter, patch: TicketChangePatch): void {
  // State
  if (patch.state !== undefined) {
    fm.state = patch.state.toLowerCase() as TicketState;
  }

  // Priority
  if (patch.priority !== undefined) {
    fm.priority = patch.priority.toLowerCase() as Priority;
  }

  // Labels
  if (patch.clear_labels) {
    fm.labels = [];
  } else if (patch.labels_replace !== undefined) {
    fm.labels = [...new Set(patch.labels_replace.map(normalizeLabel))];
  } else {
    if (patch.labels_remove?.length) {
      const toRemove = new Set(patch.labels_remove.map(normalizeLabel));
      fm.labels = fm.labels.filter(l => !toRemove.has(normalizeLabel(l)));
    }
    if (patch.labels_add?.length) {
      const existing = new Set(fm.labels.map(normalizeLabel));
      for (const label of patch.labels_add) {
        const normalized = normalizeLabel(label);
        if (!existing.has(normalized)) {
          fm.labels.push(normalized);
          existing.add(normalized);
        }
      }
    }
  }

  // Assignee (null removes the key)
  if (patch.assignee !== undefined) {
    if (patch.assignee === null) {
      delete fm.assignee;
    } else {
      fm.assignee = patch.assignee;
    }
  }

  // Reviewer (null removes the key)
  if (patch.reviewer !== undefined) {
    if (patch.reviewer === null) {
      delete fm.reviewer;
    } else {
      fm.reviewer = patch.reviewer;
    }
  }

  // Title
  if (patch.title !== undefined) {
    fm.title = patch.title.trim();
  }
}

// ---------------------------------------------------------------------------
// Step E: Serialize YAML with stable key order
// ---------------------------------------------------------------------------

function serializeFrontmatter(fm: ParsedFrontmatter): string {
  // Build ordered object
  const ordered: Record<string, unknown> = {};

  // Known keys first in order
  for (const key of FRONTMATTER_KEY_ORDER) {
    if (key in fm && fm[key] !== undefined) {
      ordered[key] = fm[key];
    }
  }

  // Remaining unknown keys in lexicographic order
  const unknownKeys = Object.keys(fm)
    .filter(k => !FRONTMATTER_KEY_ORDER.includes(k as typeof FRONTMATTER_KEY_ORDER[number]))
    .sort();
  
  for (const key of unknownKeys) {
    ordered[key] = fm[key];
  }

  return yaml.stringify(ordered, {
    indent: 2,
    lineWidth: 0, // Don't wrap
    defaultStringType: 'PLAIN',
    defaultKeyType: 'PLAIN',
  });
}

// ---------------------------------------------------------------------------
// Step F: Reconstruct file
// ---------------------------------------------------------------------------

function reconstructFile(yamlContent: string, body: string): string {
  // Ensure yaml doesn't end with newline (we add our own structure)
  const trimmedYaml = yamlContent.replace(/\n+$/, '');
  return `---\n${trimmedYaml}\n---\n${body}`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export interface PatchFrontmatterArgs {
  ticketPath: string;
  rawTicket: string;
  patch: TicketChangePatch;
}

export function patchTicketFrontmatter(args: PatchFrontmatterArgs): FrontmatterPatchResult {
  const { ticketPath, rawTicket, patch } = args;

  // Step A: Parse
  const parseResult = parseFrontmatter(rawTicket);
  if (!parseResult.ok) {
    return parseResult;
  }
  const { frontmatter, body } = parseResult;

  // Step B: Validate required keys
  const requiredError = validateRequiredKeys(frontmatter, ticketPath);
  if (requiredError) {
    return requiredError;
  }

  // Step C: Validate patch
  const patchError = validatePatch(frontmatter, patch);
  if (patchError) {
    return patchError;
  }

  // Step D: Apply patch
  applyPatch(frontmatter, patch);

  // Step E: Serialize
  const yamlContent = serializeFrontmatter(frontmatter);

  // Step F: Reconstruct
  const newContent = reconstructFile(yamlContent, body);

  return { ok: true, content: newContent };
}
