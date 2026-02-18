export type TicketErrorCode =
  | "frontmatter_missing"
  | "frontmatter_invalid_yaml"
  | "frontmatter_invalid_required_fields"
  | "invalid_transition"
  | "invalid_state"
  | "invalid_priority"
  | "invalid_labels_patch"
  | "invalid_label"
  | "invalid_actor"
  | "index_invalid_format"
  | "index_missing_ticket_entry"
  | "ticket_not_found"
  | "ambiguous_id";

export class TicketError extends Error {
  code: TicketErrorCode;
  details?: Record<string, unknown>;

  constructor(code: TicketErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "TicketError";
    this.code = code;
    this.details = details;
  }
}

export function err(code: TicketErrorCode, message: string, details?: Record<string, unknown>): TicketError {
  return new TicketError(code, message, details);
}
