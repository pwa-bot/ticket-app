import { describe, expect, it } from "vitest";
import { evaluateDelegationGuardrail } from "./delegation-guardrail.js";

describe("evaluateDelegationGuardrail", () => {
  it("blocks ambiguous prompts without explicit delegation intent", () => {
    const decision = evaluateDelegationGuardrail({
      prompt: "do what you think is best",
      hasTicketContext: true
    });

    expect(decision.approved).toBe(false);
    expect(decision.intent).toBe("ambiguous");
    expect(decision.reasonCode).toBe("ambiguous_intent_requires_confirmation");
    expect(decision.fallbackAction).toBe("scoped_ticket_action");
    expect(decision.event.properties.outcome).toBe("blocked");
  });

  it("allows explicit delegation intent", () => {
    const decision = evaluateDelegationGuardrail({
      prompt: "spawn a sub-agent session to implement TK-01ABCDEF",
      activeRepo: "acme/api",
      targetRepo: "acme/api"
    });

    expect(decision.approved).toBe(true);
    expect(decision.intent).toBe("explicit_allow");
    expect(decision.reasonCode).toBe("explicit_delegation_intent");
    expect(decision.fallbackAction).toBeNull();
    expect(decision.event.properties.outcome).toBe("approved");
  });

  it("blocks explicit delegation when repo context mismatches", () => {
    const decision = evaluateDelegationGuardrail({
      prompt: "delegate this to a sub-agent",
      activeRepo: "acme/api",
      targetRepo: "acme/web"
    });

    expect(decision.approved).toBe(false);
    expect(decision.reasonCode).toBe("repo_context_mismatch");
    expect(decision.repoContextMismatch).toBe(true);
    expect(decision.event.properties.reason_code).toBe("repo_context_mismatch");
  });

  it("respects explicit no-spawn directives", () => {
    const decision = evaluateDelegationGuardrail({
      prompt: "do not spawn sub-agents; handle it yourself",
      hasTicketContext: false
    });

    expect(decision.approved).toBe(false);
    expect(decision.intent).toBe("explicit_deny");
    expect(decision.reasonCode).toBe("explicit_no_spawn");
    expect(decision.fallbackAction).toBe("clarify_intent");
    expect(decision.event.properties.reason_code).toBe("explicit_no_spawn");
  });
});
