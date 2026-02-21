import type { ActorRef, TicketPriority, TicketState } from "./protocol.js";

export type Actor = ActorRef;
export type Priority = TicketPriority;
export type QaStatus = "pending_impl" | "ready_for_qa" | "qa_failed" | "qa_passed";

export interface TicketQa {
  required?: boolean;
  status?: QaStatus;
  status_reason?: string;
  environment?: string;
}

export interface TicketFrontmatter {
  title: string;
  state: TicketState;
  priority: TicketPriority;
  labels: string[];
  created: string;
  updated: string;
  assignee?: ActorRef;
  reviewer?: ActorRef;
  qa?: TicketQa;
}

export interface Ticket extends TicketFrontmatter {
  id: string;
  body: string;
}

export interface TicketIndexEntry {
  id: string;
  short_id: string;
  display_id: string;
  title: string;
  state: TicketState;
  priority: TicketPriority;
  labels: string[];
  path: string;
  assignee?: ActorRef;
  reviewer?: ActorRef;
  qa_required?: boolean;
  qa_status?: QaStatus;
  extras?: Record<string, unknown>;
}

export interface TicketIndex {
  format_version: 1;
  generated_at: string;
  workflow: "simple-v1";
  tickets: TicketIndexEntry[];
}

export interface TicketConfig {
  version: 1;
  id_prefix: string;
  states: TicketState[];
  priorities: TicketPriority[];
  labels: string[];
}

export function formatShortId(id: string, prefix: string = "TK"): string {
  return `${prefix}-${id.slice(0, 8)}`;
}
