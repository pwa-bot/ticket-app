// Ticket states
export type TicketState = 'backlog' | 'ready' | 'in_progress' | 'done' | 'blocked';

// Priority levels
export type Priority = 'p0' | 'p1' | 'p2' | 'p3';

// Actor format: human:slug or agent:slug
export type Actor = `human:${string}` | `agent:${string}`;

// Ticket frontmatter (YAML header in .md files)
export interface TicketFrontmatter {
  title: string;
  state: TicketState;
  priority: Priority;
  labels: string[];
  created: string; // ISO 8601
  updated: string; // ISO 8601
  assignee?: Actor;
  reviewer?: Actor;
}

// Full ticket (frontmatter + body)
export interface Ticket extends TicketFrontmatter {
  id: string; // ULID
  body: string; // Markdown content after frontmatter
}

// Index entry (minimal data for list views)
export interface TicketIndexEntry {
  id: string;
  title: string;
  state: TicketState;
  priority: Priority;
  labels: string[];
  created: string;
  updated: string;
  assignee?: Actor;
  reviewer?: Actor;
}

// Full index.json structure
export interface TicketIndex {
  version: 1;
  generated: string; // ISO 8601
  tickets: TicketIndexEntry[];
}

// Config.yml structure
export interface TicketConfig {
  version: 1;
  id_prefix: string;
  states: TicketState[];
  priorities: Priority[];
  labels: string[];
}

// State transitions
export const STATE_TRANSITIONS: Record<TicketState, TicketState[]> = {
  backlog: ['ready', 'blocked'],
  ready: ['in_progress', 'blocked'],
  in_progress: ['done', 'blocked', 'ready'],
  blocked: ['ready', 'in_progress'],
  done: [], // Terminal state
};

// Check if a state transition is valid
export function isValidTransition(from: TicketState, to: TicketState): boolean {
  return STATE_TRANSITIONS[from].includes(to);
}

// Format short ID for display (first 8 chars of ULID)
export function formatShortId(id: string, prefix: string = 'TK'): string {
  return `${prefix}-${id.slice(0, 8)}`;
}
