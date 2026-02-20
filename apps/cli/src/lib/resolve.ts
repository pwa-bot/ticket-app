import { TicketsIndex, type TicketIndexEntry } from "./index.js";
import { ERROR_CODE, EXIT_CODE, TicketError } from "./errors.js";

function ambiguousError(query: string, entries: TicketIndexEntry[]): never {
  const options = entries
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((ticket) => `${ticket.display_id} (${ticket.id})`);
  throw new TicketError(
    ERROR_CODE.AMBIGUOUS_ID,
    `Ambiguous ticket id '${query}'. Use one of:\n- ${options.join("\n- ")}`,
    EXIT_CODE.AMBIGUOUS_ID,
    {
      query,
      matches: entries.map((ticket) => ({
        id: ticket.id,
        short_id: ticket.short_id,
        display_id: ticket.display_id
      }))
    }
  );
}

export function resolveTicket(index: TicketsIndex, query: string, ci: boolean): TicketIndexEntry {
  void ci;
  const trimmed = query.trim();
  if (!trimmed) {
    throw new TicketError(ERROR_CODE.TICKET_NOT_FOUND, "Ticket id is required", EXIT_CODE.USAGE);
  }

  const normalized = trimmed.toUpperCase();

  const exactId = index.tickets.filter((ticket) => ticket.id.toUpperCase() === normalized);
  if (exactId.length === 1) {
    return exactId[0];
  }
  if (exactId.length > 1) {
    ambiguousError(trimmed, exactId);
  }

  const exactDisplay = index.tickets.filter((ticket) => ticket.display_id.toUpperCase() === normalized);
  if (exactDisplay.length === 1) {
    return exactDisplay[0];
  }
  if (exactDisplay.length > 1) {
    ambiguousError(trimmed, exactDisplay);
  }

  const exactShort = index.tickets.filter((ticket) => ticket.short_id.toUpperCase() === normalized);
  if (exactShort.length === 1) {
    return exactShort[0];
  }
  if (exactShort.length > 1) {
    ambiguousError(trimmed, exactShort);
  }

  throw new TicketError(
    ERROR_CODE.TICKET_NOT_FOUND,
    `Ticket not found: ${query}`,
    EXIT_CODE.NOT_FOUND,
    { query }
  );
}
