export interface ExplainPlanMetrics {
  executionTimeMs: number | null;
  planningTimeMs: number | null;
  hasSeqScan: boolean;
  hasIndexScan: boolean;
  hasBitmapScan: boolean;
}

export function summarizeExplainPlan(lines: string[]): ExplainPlanMetrics {
  let executionTimeMs: number | null = null;
  let planningTimeMs: number | null = null;
  let hasSeqScan = false;
  let hasIndexScan = false;
  let hasBitmapScan = false;

  for (const line of lines) {
    if (line.includes("Seq Scan")) {
      hasSeqScan = true;
    }
    if (line.includes("Index Scan") || line.includes("Index Only Scan")) {
      hasIndexScan = true;
    }
    if (line.includes("Bitmap Index Scan") || line.includes("Bitmap Heap Scan")) {
      hasBitmapScan = true;
    }

    const execMatch = line.match(/Execution Time:\s+([\d.]+)\s+ms/i);
    if (execMatch) {
      executionTimeMs = Number(execMatch[1]);
    }

    const planningMatch = line.match(/Planning Time:\s+([\d.]+)\s+ms/i);
    if (planningMatch) {
      planningTimeMs = Number(planningMatch[1]);
    }
  }

  return {
    executionTimeMs,
    planningTimeMs,
    hasSeqScan,
    hasIndexScan,
    hasBitmapScan,
  };
}
