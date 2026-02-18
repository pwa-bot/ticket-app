import type { ActorRef, TicketPriority, TicketState } from "./protocol.js";

export type TicketChangePatch = {
  state?: TicketState;
  priority?: TicketPriority;
  labels_add?: string[];
  labels_remove?: string[];
  labels_replace?: string[];
  clear_labels?: boolean;
  assignee?: ActorRef | null;
  reviewer?: ActorRef | null;
  title?: string;
};
