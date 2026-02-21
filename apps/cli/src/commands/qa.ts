import { promises as fs } from "node:fs";
import path from "node:path";
import { INDEX_PATH } from "../lib/constants.js";
import { EXIT_CODE, ERROR_CODE, TicketError } from "../lib/errors.js";
import { autoCommit } from "../lib/git.js";
import { rebuildIndex } from "../lib/index.js";
import { readIndex } from "../lib/io.js";
import { shouldCommit, success } from "../lib/output.js";
import { parseTicketDocument, renderTicketDocument, type QaStatus } from "../lib/parse.js";
import { assertQaChecklistPresent, setQaStatus } from "../lib/qa.js";
import { resolveTicket } from "../lib/resolve.js";

export interface QaCommandOptions {
  ci?: boolean;
}

export interface QaReadyOptions extends QaCommandOptions {
  env?: string;
}

export interface QaFailOptions extends QaCommandOptions {
  reason?: string;
}

export interface QaPassOptions extends QaCommandOptions {
  env?: string;
}

async function updateQaStatus(
  cwd: string,
  id: string,
  options: QaCommandOptions,
  mutation: (fileName: string, parsed: ReturnType<typeof parseTicketDocument>) => void | Promise<void>,
  commitSubject: string,
  successMessage: string
): Promise<void> {
  const index = await readIndex(cwd);
  const ticket = resolveTicket(index, id, options.ci ?? false);
  const ticketPath = path.join(cwd, ticket.path);
  const markdown = await fs.readFile(ticketPath, "utf8");
  const parsed = parseTicketDocument(markdown, path.basename(ticket.path), ticket.id);

  await mutation(path.basename(ticket.path), parsed);

  const output = renderTicketDocument(parsed.parsed);
  await fs.writeFile(ticketPath, output, "utf8");
  await rebuildIndex(cwd);

  if (shouldCommit()) {
    try {
      await autoCommit(
        cwd,
        [ticketPath, path.join(cwd, INDEX_PATH)],
        `ticket: ${ticket.display_id} ${commitSubject}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Warning: git auto-commit failed: ${message}`);
    }
  }

  success(`${successMessage} ${ticket.display_id}`);
}

function normalizeRequiredString(value: string | undefined, optionName: string): string {
  const normalized = value?.trim() ?? "";
  if (normalized.length > 0) {
    return normalized;
  }
  throw new TicketError(
    ERROR_CODE.VALIDATION_FAILED,
    `Missing required option: ${optionName}`,
    EXIT_CODE.USAGE,
    { option: optionName }
  );
}

function assertInProgressState(state: string, fileName: string): void {
  if (state === "in_progress") {
    return;
  }
  throw new TicketError(
    ERROR_CODE.INVALID_TRANSITION,
    `${fileName}: QA transitions require state 'in_progress'`,
    EXIT_CODE.INVALID_TRANSITION,
    { state }
  );
}

function formatQaStatus(status: QaStatus | undefined): string {
  return status ?? "unset";
}

function assertQaStatusTransition(
  fileName: string,
  currentStatus: QaStatus | undefined,
  nextStatus: QaStatus,
  allowedCurrent: readonly (QaStatus | undefined)[]
): void {
  if (allowedCurrent.includes(currentStatus)) {
    return;
  }
  const allowed = allowedCurrent.map((status) => formatQaStatus(status)).join(", ");
  throw new TicketError(
    ERROR_CODE.INVALID_TRANSITION,
    `${fileName}: invalid QA transition ${formatQaStatus(currentStatus)} -> ${nextStatus} (allowed from: ${allowed})`,
    EXIT_CODE.INVALID_TRANSITION,
    {
      qa_status: currentStatus ?? null,
      target_qa_status: nextStatus,
      allowed_from: allowedCurrent.map((status) => status ?? null)
    }
  );
}

export async function runQaReady(cwd: string, id: string, options: QaReadyOptions): Promise<void> {
  const environment = normalizeRequiredString(options.env, "--env");
  await updateQaStatus(
    cwd,
    id,
    options,
    (fileName, parsed) => {
      assertInProgressState(parsed.frontmatter.state, fileName);
      assertQaStatusTransition(fileName, parsed.frontmatter.qa?.status, "ready_for_qa", [undefined, "pending_impl", "qa_failed"]);
      assertQaChecklistPresent(parsed.parsed.content, fileName);
      setQaStatus(parsed.parsed, "ready_for_qa", { required: true, environment });
    },
    "qa -> ready_for_qa",
    "Set QA status ready_for_qa for"
  );
}

export async function runQaFail(cwd: string, id: string, options: QaFailOptions): Promise<void> {
  const reason = normalizeRequiredString(options.reason, "--reason");
  await updateQaStatus(
    cwd,
    id,
    options,
    (fileName, parsed) => {
      assertInProgressState(parsed.frontmatter.state, fileName);
      assertQaStatusTransition(fileName, parsed.frontmatter.qa?.status, "qa_failed", ["ready_for_qa"]);
      setQaStatus(parsed.parsed, "qa_failed", { required: true, reason });
    },
    "qa -> qa_failed",
    "Set QA status qa_failed for"
  );
}

export async function runQaPass(cwd: string, id: string, options: QaPassOptions): Promise<void> {
  const environment = normalizeRequiredString(options.env, "--env");
  await updateQaStatus(
    cwd,
    id,
    options,
    (fileName, parsed) => {
      assertInProgressState(parsed.frontmatter.state, fileName);
      assertQaStatusTransition(fileName, parsed.frontmatter.qa?.status, "qa_passed", ["ready_for_qa"]);
      setQaStatus(parsed.parsed, "qa_passed", { required: true, environment });
    },
    "qa -> qa_passed",
    "Set QA status qa_passed for"
  );
}

export async function runQaReset(cwd: string, id: string, options: QaCommandOptions): Promise<void> {
  await updateQaStatus(
    cwd,
    id,
    options,
    (fileName, parsed) => {
      assertInProgressState(parsed.frontmatter.state, fileName);
      assertQaStatusTransition(fileName, parsed.frontmatter.qa?.status, "pending_impl", ["ready_for_qa", "qa_failed", "qa_passed"]);
      setQaStatus(parsed.parsed, "pending_impl", { required: true });
    },
    "qa -> pending_impl",
    "Set QA status pending_impl for"
  );
}
