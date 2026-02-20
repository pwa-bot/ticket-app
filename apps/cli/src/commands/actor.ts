import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { INDEX_PATH } from "../lib/constants.js";
import { ERROR_CODE, EXIT_CODE, TicketError } from "../lib/errors.js";
import { autoCommit } from "../lib/git.js";
import { rebuildIndex } from "../lib/index.js";
import { readIndex } from "../lib/io.js";
import { resolveTicket } from "../lib/resolve.js";

export interface ActorCommandOptions {
  ci?: boolean;
}

type ActorField = "assignee" | "reviewer";

function normalizeActor(actor: string): string {
  const value = actor.trim().toLowerCase();
  if (!/^(human|agent):[a-z0-9][a-z0-9_-]{0,31}$/.test(value)) {
    throw new TicketError(
      ERROR_CODE.INVALID_ACTOR,
      "Invalid actor format. Expected human:<slug> or agent:<slug>",
      EXIT_CODE.USAGE
    );
  }
  return value;
}

async function updateTicketActor(ticketPath: string, field: ActorField, actor: string): Promise<void> {
  const markdown = await fs.readFile(ticketPath, "utf8");
  const parsed = matter(markdown);
  parsed.data[field] = actor;
  const output = matter.stringify(parsed.content, parsed.data);
  await fs.writeFile(ticketPath, output, "utf8");
}

async function runActorUpdate(
  cwd: string,
  ticketPath: string,
  ticketDisplayId: string,
  actorValue: string,
  field: ActorField,
  commitAction: "assign" | "reviewer"
): Promise<void> {
  const actor = normalizeActor(actorValue);

  await updateTicketActor(ticketPath, field, actor);
  await rebuildIndex(cwd);

  const indexPath = path.join(cwd, INDEX_PATH);
  const display = ticketDisplayId;

  try {
    await autoCommit(
      cwd,
      [ticketPath, indexPath],
      `ticket: ${commitAction} ${display} to ${actor}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Warning: git auto-commit failed: ${message}`);
  }

  if (field === "assignee") {
    console.log(`Assigned ${display} to ${actor}`);
    return;
  }

  console.log(`Set reviewer for ${display} to ${actor}`);
}

export async function runAssign(cwd: string, id: string, actor: string, options: ActorCommandOptions): Promise<void> {
  const index = await readIndex(cwd);
  const ticket = resolveTicket(index, id, options.ci ?? false);
  await runActorUpdate(cwd, path.join(cwd, ticket.path), ticket.display_id, actor, "assignee", "assign");
}

export async function runReviewer(cwd: string, id: string, actor: string, options: ActorCommandOptions): Promise<void> {
  const index = await readIndex(cwd);
  const ticket = resolveTicket(index, id, options.ci ?? false);
  await runActorUpdate(cwd, path.join(cwd, ticket.path), ticket.display_id, actor, "reviewer", "reviewer");
}
