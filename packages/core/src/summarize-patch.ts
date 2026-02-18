import type { TicketChangePatch } from "./types.js";

export function summarizePatch(patch: TicketChangePatch, fromState?: string, toState?: string): string {
  if (patch.state && fromState && toState) return `${fromState} → ${toState}`;
  if (patch.state) return `state → ${patch.state}`;
  if (patch.priority) return `priority → ${patch.priority}`;

  const labelOps = [
    ...(patch.labels_add?.length ? ["labels +"] : []),
    ...(patch.labels_remove?.length ? ["labels -"] : []),
    ...(patch.labels_replace?.length ? ["labels ="] : []),
    ...(patch.clear_labels ? ["labels cleared"] : []),
  ];
  if (labelOps.length) return "labels updated";

  if (patch.assignee !== undefined) return "assignee updated";
  if (patch.reviewer !== undefined) return "reviewer updated";
  if (patch.title) return "title updated";

  return "metadata updated";
}
