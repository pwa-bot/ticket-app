import type matter from "gray-matter";
import { EXIT_CODE, ERROR_CODE, TicketError } from "./errors.js";
import type { QaStatus } from "./parse.js";

export const QA_CHECKLIST_HEADINGS = [
  "Test Steps",
  "Expected Results",
  "Risk Notes",
  "Rollback Notes",
  "Observed Results",
  "Environment",
  "Pass/Fail Decision"
] as const;

export function getQaChecklistMissingSections(body: string): string[] {
  const qaSection = body.match(/(?:^|\n)##\s+QA\s*[\r\n]+([\s\S]*?)(?=\n##\s+|$)/i);
  if (!qaSection) {
    return ["QA"];
  }
  return QA_CHECKLIST_HEADINGS.filter((heading) => {
    const headingRegex = new RegExp(`(?:^|\\n)###\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(?:\\n|$)`, "i");
    return !headingRegex.test(qaSection[1]);
  });
}

export function assertQaChecklistPresent(body: string, fileLabel: string): void {
  const missing = getQaChecklistMissingSections(body);
  if (missing.length === 0) {
    return;
  }
  const detail = missing.includes("QA")
    ? "missing required `## QA` section"
    : `missing QA checklist headings: ${missing.join(", ")}`;
  throw new TicketError(
    ERROR_CODE.VALIDATION_FAILED,
    `${fileLabel}: ${detail}`,
    EXIT_CODE.VALIDATION_FAILED,
    { missing }
  );
}

export function ensureQaEnvelope(data: Record<string, unknown>): Record<string, unknown> {
  const xTicketRaw = data.x_ticket;
  const xTicket = xTicketRaw && typeof xTicketRaw === "object" && !Array.isArray(xTicketRaw)
    ? { ...(xTicketRaw as Record<string, unknown>) }
    : {};
  const qaRaw = xTicket.qa;
  const qa = qaRaw && typeof qaRaw === "object" && !Array.isArray(qaRaw)
    ? { ...(qaRaw as Record<string, unknown>) }
    : {};
  xTicket.qa = qa;
  data.x_ticket = xTicket;
  return qa;
}

export function setQaStatus(
  document: matter.GrayMatterFile<string>,
  status: QaStatus,
  options: { required?: boolean; environment?: string; reason?: string }
): void {
  const data = document.data as Record<string, unknown>;
  const qa = ensureQaEnvelope(data);
  qa.status = status;
  if (typeof options.required === "boolean") {
    qa.required = options.required;
  }
  if (options.environment) {
    qa.environment = options.environment;
  }
  if (options.reason) {
    qa.status_reason = options.reason;
  } else if (status !== "qa_failed") {
    delete qa.status_reason;
  }
}

export function qaIndicator(status?: QaStatus): string {
  if (status === "ready_for_qa") return "QA_READY";
  if (status === "qa_failed") return "QA_FAIL";
  if (status === "qa_passed") return "QA_PASS";
  if (status === "pending_impl") return "QA_PENDING";
  return "";
}
