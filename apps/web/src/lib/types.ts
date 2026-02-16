// Inlined from @ticket-app/core to avoid Vercel monorepo issues

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
  short_id: string;
  display_id: string;
  title: string;
  state: TicketState;
  priority: Priority;
  labels: string[];
  path: string;
  assignee?: Actor;
  reviewer?: Actor;
  extras?: Record<string, unknown>;
}

// Full index.json structure
export interface TicketIndex {
  format_version: 1;
  generated_at: string; // ISO 8601
  workflow: 'simple-v1';
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

// Format short ID for display (first 8 chars of ULID)
export function formatShortId(id: string, prefix: string = 'TK'): string {
  return `${prefix}-${id.slice(0, 8)}`;
}
