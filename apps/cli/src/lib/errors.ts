export const EXIT_CODE = {
  SUCCESS: 0,
  UNEXPECTED: 1,
  USAGE: 2,
  NOT_INITIALIZED: 3,
  NOT_FOUND: 4,
  AMBIGUOUS_ID: 5,
  INVALID_TRANSITION: 6,
  VALIDATION_FAILED: 7,
  NOT_GIT_REPO: 8
} as const;

export type ExitCode = (typeof EXIT_CODE)[keyof typeof EXIT_CODE];

export const ERROR_CODE = {
  NOT_GIT_REPO: "not_git_repo",
  NOT_INITIALIZED: "not_initialized",
  TICKET_NOT_FOUND: "ticket_not_found",
  AMBIGUOUS_ID: "ambiguous_id",
  INVALID_STATE: "invalid_state",
  INVALID_PRIORITY: "invalid_priority",
  INVALID_TRANSITION: "invalid_transition",
  INVALID_ACTOR: "invalid_actor",
  VALIDATION_FAILED: "validation_failed",
  INDEX_OUT_OF_SYNC: "index_out_of_sync",
  IO_ERROR: "io_error"
} as const;

export type TicketErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];
export type TicketErrorDetails = Record<string, unknown>;

export class TicketError extends Error {
  readonly code: TicketErrorCode;
  readonly details: TicketErrorDetails;
  readonly exitCode: ExitCode;

  constructor(code: TicketErrorCode, message: string, exitCode: ExitCode, details: TicketErrorDetails = {}) {
    super(message);
    this.name = "TicketError";
    this.code = code;
    this.details = details;
    this.exitCode = exitCode;
  }
}
