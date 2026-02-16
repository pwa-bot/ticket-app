#!/usr/bin/env node

import { Command } from "commander";
import { runInit } from "./commands/init.js";
import { runNew } from "./commands/new.js";
import { runList } from "./commands/list.js";
import { runShow } from "./commands/show.js";
import { runDone, runMove, runStart } from "./commands/move.js";
import { runAssign, runReviewer } from "./commands/actor.js";
import { runRebuildIndex } from "./commands/rebuild-index.js";

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("ticket")
    .description("Git-native issue tracking CLI")
    .version("0.1.0");

  program
    .command("init")
    .description("Create .tickets/ structure")
    .action(async () => {
      await runInit(process.cwd());
    });

  program
    .command("new")
    .description("Create a new ticket")
    .argument("<title>", "Ticket title")
    .option("--priority <priority>", "Ticket priority", "p1")
    .option("--state <state>", "Initial ticket state", "backlog")
    .option("--label <label>", "Label to add", collectLabel, [])
    .action(async (title: string, options: { priority: string; state: string; label: string[] }) => {
      await runNew(process.cwd(), title, options);
    });

  program
    .command("list")
    .description("List tickets from index")
    .option("--state <state>", "Filter by state")
    .option("--label <label>", "Filter by label")
    .option("--format <format>", "Output format: table|kanban", "table")
    .action(async (options: { state?: string; label?: string; format?: string }) => {
      await runList(process.cwd(), options);
    });

  program
    .command("show")
    .description("Show a ticket")
    .argument("<id>", "Ticket id (ULID or short id)")
    .option("--ci", "Enable CI mode (exact id matching only)")
    .action(async (id: string, options: { ci?: boolean }) => {
      await runShow(process.cwd(), id, options);
    });

  program
    .command("move")
    .description("Move a ticket to a new state")
    .argument("<id>", "Ticket id (ULID or short id)")
    .argument("<state>", "Target state")
    .option("--ci", "Enable CI mode (exact id matching only)")
    .action(async (id: string, state: string, options: { ci?: boolean }) => {
      await runMove(process.cwd(), id, state, options);
    });

  program
    .command("start")
    .description("Move a ticket to in_progress")
    .argument("<id>", "Ticket id (ULID or short id)")
    .option("--ci", "Enable CI mode (exact id matching only)")
    .action(async (id: string, options: { ci?: boolean }) => {
      await runStart(process.cwd(), id, options);
    });

  program
    .command("done")
    .description("Move a ticket to done")
    .argument("<id>", "Ticket id (ULID or short id)")
    .option("--ci", "Enable CI mode (exact id matching only)")
    .action(async (id: string, options: { ci?: boolean }) => {
      await runDone(process.cwd(), id, options);
    });

  program
    .command("assign")
    .description("Set the assignee for a ticket")
    .argument("<id>", "Ticket id (ULID or short id)")
    .argument("<actor>", "Actor (human:<slug> or agent:<slug>)")
    .option("--ci", "Enable CI mode (exact id matching only)")
    .action(async (id: string, actor: string, options: { ci?: boolean }) => {
      await runAssign(process.cwd(), id, actor, options);
    });

  program
    .command("reviewer")
    .description("Set the reviewer for a ticket")
    .argument("<id>", "Ticket id (ULID or short id)")
    .argument("<actor>", "Actor (human:<slug> or agent:<slug>)")
    .option("--ci", "Enable CI mode (exact id matching only)")
    .action(async (id: string, actor: string, options: { ci?: boolean }) => {
      await runReviewer(process.cwd(), id, actor, options);
    });

  program
    .command("rebuild-index")
    .description("Force regenerate index.json from all ticket files")
    .action(async () => {
      await runRebuildIndex(process.cwd());
    });

  await program.parseAsync(process.argv);
}

function collectLabel(value: string, previous: string[]): string[] {
  return [...previous, value];
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
