import { TicketsIndex, type TicketIndexEntry } from "./index.js";

function ambiguousError(entries: TicketIndexEntry[]): never {
  const ids = entries.map((ticket) => ticket.display_id).join(", ");
  throw new Error(`Ambiguous ticket id. Matches: ${ids}`);
}

export function resolveTicket(index: TicketsIndex, query: string, ci: boolean): TicketIndexEntry {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("Ticket id is required");
  }

  if (ci) {
    const exact = index.tickets.filter((ticket) => ticket.id === trimmed || ticket.short_id === trimmed);
    if (exact.length === 0) {
      throw new Error(`Ticket not found: ${trimmed}`);
    }
    if (exact.length > 1) {
      ambiguousError(exact);
    }
    return exact[0];
  }

  const normalized = trimmed.toUpperCase();

  const exactId = index.tickets.filter((ticket) => ticket.id.toUpperCase() === normalized);
  if (exactId.length === 1) {
    return exactId[0];
  }
  if (exactId.length > 1) {
    ambiguousError(exactId);
  }

  const exactShort = index.tickets.filter((ticket) => ticket.short_id.toUpperCase() === normalized);
  if (exactShort.length === 1) {
    return exactShort[0];
  }
  if (exactShort.length > 1) {
    ambiguousError(exactShort);
  }

  const exactDisplay = index.tickets.filter((ticket) => ticket.display_id.toUpperCase() === normalized);
  if (exactDisplay.length === 1) {
    return exactDisplay[0];
  }
  if (exactDisplay.length > 1) {
    ambiguousError(exactDisplay);
  }

  const prefix = index.tickets.filter((ticket) => ticket.id.toUpperCase().startsWith(normalized));
  if (prefix.length === 1) {
    return prefix[0];
  }
  if (prefix.length > 1) {
    ambiguousError(prefix);
  }

  const needle = trimmed.toLowerCase();
  const titleMatches = index.tickets.filter((ticket) => ticket.title.toLowerCase().includes(needle));
  if (titleMatches.length === 1) {
    return titleMatches[0];
  }
  if (titleMatches.length > 1) {
    ambiguousError(titleMatches);
  }

  throw new Error(`Ticket not found: ${query}`);
}
