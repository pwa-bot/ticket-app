import { ulid } from "ulid";

export function generateTicketId(): string {
  return ulid().toUpperCase();
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}

export function displayId(id: string): string {
  return `TK-${shortId(id)}`;
}
