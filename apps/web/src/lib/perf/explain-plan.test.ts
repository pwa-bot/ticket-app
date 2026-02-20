import assert from "node:assert/strict";
import test from "node:test";
import { summarizeExplainPlan } from "./explain-plan";

test("summarizeExplainPlan extracts timings and scan types", () => {
  const metrics = summarizeExplainPlan([
    "Bitmap Heap Scan on pending_changes  (cost=4.13..11.26 rows=3 width=276) (actual time=0.009..0.009 rows=0 loops=1)",
    "  ->  Bitmap Index Scan on pending_changes_active_ticket_idx  (cost=0.00..4.13 rows=3 width=0) (actual time=0.006..0.006 rows=0 loops=1)",
    "Planning Time: 0.135 ms",
    "Execution Time: 0.035 ms",
  ]);

  assert.equal(metrics.hasBitmapScan, true);
  assert.equal(metrics.hasIndexScan, true);
  assert.equal(metrics.hasSeqScan, false);
  assert.equal(metrics.planningTimeMs, 0.135);
  assert.equal(metrics.executionTimeMs, 0.035);
});

test("summarizeExplainPlan handles seq scan plans with missing timings", () => {
  const metrics = summarizeExplainPlan([
    "Seq Scan on tickets  (cost=0.00..6.22 rows=97 width=345) (actual time=0.006..0.027 rows=97 loops=1)",
  ]);

  assert.equal(metrics.hasSeqScan, true);
  assert.equal(metrics.hasIndexScan, false);
  assert.equal(metrics.hasBitmapScan, false);
  assert.equal(metrics.planningTimeMs, null);
  assert.equal(metrics.executionTimeMs, null);
});
