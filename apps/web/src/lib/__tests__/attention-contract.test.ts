import assert from "node:assert/strict";
import test from "node:test";
import {
  compareAttentionItems,
  getReasonCatalog,
  toReasonDetails,
  type AttentionReason,
} from "../attention-contract";

test("toReasonDetails returns deduplicated reasons ordered by precedence", () => {
  const details = toReasonDetails([
    "pending_pr",
    "blocked",
    "ci_failing",
    "blocked",
  ] satisfies AttentionReason[]);

  assert.deepEqual(details.map((detail) => detail.code), ["blocked", "ci_failing", "pending_pr"]);
});

test("getReasonCatalog exposes stable ordered contract", () => {
  const catalog = getReasonCatalog();
  assert.equal(catalog.length, 5);
  assert.deepEqual(catalog.map((item) => item.code), [
    "blocked",
    "ci_failing",
    "stale_in_progress",
    "pr_waiting_review",
    "pending_pr",
  ]);
  assert.ok(catalog.every((item) => item.label.length > 0 && item.description.length > 0));
});

test("compareAttentionItems sorts by reason precedence first", () => {
  const blocked = {
    primaryReason: "blocked" as const,
    mergeReadiness: "UNKNOWN" as const,
    priority: "p3",
    createdAt: "2026-02-20T08:00:00.000Z",
  };
  const pending = {
    primaryReason: "pending_pr" as const,
    mergeReadiness: "CONFLICT" as const,
    priority: "p0",
    createdAt: "2026-02-19T08:00:00.000Z",
  };

  assert.ok(compareAttentionItems(blocked, pending) < 0);
});

test("compareAttentionItems supports multi-reason tie-breakers", () => {
  const waitingReviewConflict = {
    primaryReason: "pr_waiting_review" as const,
    mergeReadiness: "CONFLICT" as const,
    priority: "p2",
    createdAt: "2026-02-20T08:00:00.000Z",
  };
  const waitingReviewMergeable = {
    primaryReason: "pr_waiting_review" as const,
    mergeReadiness: "MERGEABLE_NOW" as const,
    priority: "p0",
    createdAt: "2026-02-18T08:00:00.000Z",
  };

  assert.ok(compareAttentionItems(waitingReviewConflict, waitingReviewMergeable) < 0);

  const sameReadinessDifferentPriority = {
    ...waitingReviewMergeable,
    priority: "p0",
  };
  const lowerPriority = {
    ...waitingReviewMergeable,
    priority: "p2",
  };
  assert.ok(compareAttentionItems(sameReadinessDifferentPriority, lowerPriority) < 0);
});
