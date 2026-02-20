import type { Priority, TicketIndexEntry } from "@ticketdotapp/core";

export type CiStatus = "success" | "failure" | "pending" | "unknown";
export type MergeReadiness = "MERGEABLE_NOW" | "WAITING_REVIEW" | "FAILING_CHECKS" | "CONFLICT" | "UNKNOWN";

export interface AttentionTicket extends TicketIndexEntry {
  created?: string;
  updated?: string;
}

export interface AttentionRow {
  repo: string;
  generatedAt?: string;
  ticket: AttentionTicket;
}

export function priorityRank(priority: Priority): number {
  const ranks: Record<Priority, number> = { p0: 0, p1: 1, p2: 2, p3: 3 };
  return ranks[priority];
}

export function getDisplayId(ticket: TicketIndexEntry): string {
  return ticket.display_id ?? `TK-${ticket.id.slice(0, 8).toUpperCase()}`;
}

export function getActorDisplay(actor?: string): string {
  if (!actor) {
    return "—";
  }

  const parts = actor.split(":");
  if (parts.length === 2 && parts[1]) {
    return parts[1];
  }

  return actor;
}

export function truncateTitle(title: string, limit: number = 60): string {
  if (title.length <= limit) {
    return title;
  }

  return `${title.slice(0, limit - 1)}…`;
}

function getDateFromRow(row: AttentionRow, key: "created" | "updated"): Date | null {
  const explicit = row.ticket[key];
  if (explicit) {
    const parsed = new Date(explicit);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  if (key === "updated" && row.generatedAt) {
    const parsed = new Date(row.generatedAt);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  if (key === "created" && row.generatedAt) {
    const parsed = new Date(row.generatedAt);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

export function getAgeShort(row: AttentionRow, now: Date = new Date()): string {
  const created = getDateFromRow(row, "created");
  if (!created) {
    return "—";
  }

  const diffMs = Math.max(0, now.getTime() - created.getTime());
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 24) {
    return `${Math.max(1, hours)}h`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d`;
  }

  const weeks = Math.floor(days / 7);
  if (weeks < 5) {
    return `${weeks}w`;
  }

  const months = Math.floor(days / 30);
  return `${Math.max(1, months)}mo`;
}

export function getUpdatedLabel(row: AttentionRow, now: Date = new Date()): string {
  const updated = getDateFromRow(row, "updated");
  if (!updated) {
    return "—";
  }

  const diffMs = Math.max(0, now.getTime() - updated.getTime());
  const minutes = Math.floor(diffMs / (1000 * 60));
  if (minutes < 60) {
    return `${Math.max(1, minutes)}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  if (hours < 48) {
    return "yesterday";
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function getCreatedTimestamp(row: AttentionRow): number {
  const created = getDateFromRow(row, "created");
  return created?.getTime() ?? Number.POSITIVE_INFINITY;
}
