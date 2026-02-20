export type DelegationIntent =
  | "explicit_allow"
  | "explicit_deny"
  | "ambiguous"
  | "no_explicit_signal";

export type DelegationGuardrailReasonCode =
  | "explicit_delegation_intent"
  | "explicit_no_spawn"
  | "ambiguous_intent_requires_confirmation"
  | "missing_explicit_delegation_intent"
  | "repo_context_mismatch";

export type DelegationFallbackAction = "clarify_intent" | "scoped_ticket_action" | null;

export interface DelegationGuardrailInput {
  prompt: string;
  activeRepo?: string | null;
  targetRepo?: string | null;
  hasTicketContext?: boolean;
}

export interface DelegationGuardrailDecision {
  approved: boolean;
  intent: DelegationIntent;
  reasonCode: DelegationGuardrailReasonCode;
  fallbackAction: DelegationFallbackAction;
  repoContextMismatch: boolean;
  event: {
    event: "delegation_guardrail_decision";
    properties: {
      outcome: "approved" | "blocked";
      reason_code: DelegationGuardrailReasonCode;
      intent: DelegationIntent;
      repo_context_mismatch: boolean;
      fallback_action: DelegationFallbackAction;
    };
  };
}

const AMBIGUOUS_PATTERNS: RegExp[] = [
  /\bdo what(?:ever)? (?:you|u) (?:think|feel)(?: is)? best\b/i,
  /\bdo what's best\b/i,
  /\byou decide\b/i,
  /\bhandle it\b/i,
  /\btake it from here\b/i
];

function hasPattern(input: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(input));
}

function classifyDelegationIntent(prompt: string): DelegationIntent {
  const normalized = prompt.toLowerCase();
  const explicitDeny =
    /\b(?:do not|don't|dont|no|never)\s+(?:delegate|delegation|spawn|use)\b/.test(normalized)
    && /\b(?:sub-?agents?|delegat(?:ed|ion)|agents?)\b/.test(normalized);
  if (explicitDeny) {
    return "explicit_deny";
  }

  const explicitAllow =
    /\b(?:delegate|delegation|spawn|hand off|offload)\b/.test(normalized)
    && /\b(?:sub-?agents?|agents?|session)\b/.test(normalized);
  if (explicitAllow) {
    return "explicit_allow";
  }

  if (hasPattern(prompt, AMBIGUOUS_PATTERNS)) {
    return "ambiguous";
  }

  return "no_explicit_signal";
}

function normalizeRepo(repo?: string | null): string | null {
  if (!repo) {
    return null;
  }
  const normalized = repo.trim().toLowerCase();
  return normalized || null;
}

function withEvent(
  approved: boolean,
  intent: DelegationIntent,
  reasonCode: DelegationGuardrailReasonCode,
  repoContextMismatch: boolean,
  fallbackAction: DelegationFallbackAction
): DelegationGuardrailDecision {
  return {
    approved,
    intent,
    reasonCode,
    fallbackAction,
    repoContextMismatch,
    event: {
      event: "delegation_guardrail_decision",
      properties: {
        outcome: approved ? "approved" : "blocked",
        reason_code: reasonCode,
        intent,
        repo_context_mismatch: repoContextMismatch,
        fallback_action: fallbackAction
      }
    }
  };
}

export function evaluateDelegationGuardrail(input: DelegationGuardrailInput): DelegationGuardrailDecision {
  const intent = classifyDelegationIntent(input.prompt);
  const activeRepo = normalizeRepo(input.activeRepo);
  const targetRepo = normalizeRepo(input.targetRepo);
  const repoContextMismatch = Boolean(activeRepo && targetRepo && activeRepo !== targetRepo);
  const fallbackAction: DelegationFallbackAction = input.hasTicketContext ? "scoped_ticket_action" : "clarify_intent";

  if (intent === "explicit_deny") {
    return withEvent(false, intent, "explicit_no_spawn", repoContextMismatch, fallbackAction);
  }

  if (repoContextMismatch) {
    return withEvent(false, intent, "repo_context_mismatch", true, fallbackAction);
  }

  if (intent === "explicit_allow") {
    return withEvent(true, intent, "explicit_delegation_intent", false, null);
  }

  if (intent === "ambiguous") {
    return withEvent(false, intent, "ambiguous_intent_requires_confirmation", false, fallbackAction);
  }

  return withEvent(false, intent, "missing_explicit_delegation_intent", false, fallbackAction);
}
