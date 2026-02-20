// Protocol types and validation
import type { TicketState } from "./protocol.js";

export {
  type TicketState,
  type TicketPriority,
  type ActorType,
  type ActorRef,
  STATE_ORDER,
  PRIORITY_ORDER,
  normalizeState,
  normalizePriority,
  isValidTransition,
  getAllowedTransitions,
  validateActorRef,
  normalizeLabels,
} from "./protocol.js";

// Error handling
export { TicketError, err, type TicketErrorCode } from "./errors.js";

// API types
export {
  type ApiErrorCode,
  type ApiError,
  type ApiEnvelope,
  type PendingChangeStatus,
  type CiStatusSummary,
  type CreateChangePrResponse,
  type PrStatusResponse,
  type PendingChangeType,
  type MergeSignals,
  type PendingChange,
} from "./api-types.js";

// Patch types
export { type TicketChangePatch } from "./types.js";

// Patch algorithms
export { patchTicketFrontmatter } from "./patch-frontmatter.js";
export { patchIndexJson } from "./patch-index.js";

// Naming and utilities
export { slugifyTitle } from "./slugify.js";
export {
  buildTicketChangeBranchName,
  buildPrTitle,
  buildPrBody,
  buildCanonicalCodeBranchName,
} from "./naming.js";
export { summarizePatch } from "./summarize-patch.js";

// Shared ticket domain types
export {
  type Actor,
  type Priority,
  type TicketFrontmatter,
  type Ticket,
  type TicketIndexEntry,
  type TicketIndex,
  type TicketConfig,
  formatShortId,
} from "./ticket-types.js";

// State transitions (legacy export)
export const STATE_TRANSITIONS: Record<TicketState, TicketState[]> = {
  backlog: ["ready", "blocked"],
  ready: ["in_progress", "blocked"],
  in_progress: ["done", "blocked", "ready"],
  blocked: ["ready", "in_progress"],
  done: [],
};
