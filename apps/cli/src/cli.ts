#!/usr/bin/env node

import { Command } from "commander";
import { runInit } from "./commands/init.js";
import { runNew } from "./commands/new.js";
import { runList } from "./commands/list.js";
import { runShow } from "./commands/show.js";
import { runDone, runMove, runStart } from "./commands/move.js";
import { runAssign, runReviewer } from "./commands/actor.js";
import { runRebuildIndex } from "./commands/rebuild-index.js";
import { runEdit } from "./commands/edit.js";
import { runBranch } from "./commands/branch.js";
import { runValidate } from "./commands/validate.js";
import { runInstallHooks } from "./commands/install-hooks.js";
import { EXIT_CODE, TicketError } from "./lib/errors.js";
import { failureEnvelope, writeEnvelope } from "./lib/json.js";
import { setNoCommitMode, setQuietMode } from "./lib/output.js";
import { emitCliTelemetry } from "./lib/telemetry.js";

interface GlobalCliOptions {
  json?: boolean;
  quiet?: boolean;
  noCommit?: boolean;
}

function getGlobalOptions(command: Command): GlobalCliOptions {
  return command.optsWithGlobals<GlobalCliOptions>();
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("ticket")
    .description("Git-native issue tracking CLI")
    .version("0.1.0")
    .option("--json", "Emit a JSON envelope")
    .option("-q, --quiet", "Suppress success output")
    .option("--no-commit", "Skip auto-commit (for dev/testing)")
    .hook("preAction", (thisCommand, actionCommand) => {
      const opts = thisCommand.optsWithGlobals<GlobalCliOptions>();
      setQuietMode(opts.quiet ?? false);
      setNoCommitMode(opts.noCommit ?? false);

      const commandName = actionCommand.name();
      void emitCliTelemetry("cli_activation_command_started", {
        command: commandName,
        args: actionCommand.args.length,
      });
    })
    .hook("postAction", (_thisCommand, actionCommand) => {
      void emitCliTelemetry("cli_activation_command_succeeded", {
        command: actionCommand.name(),
      });
    });

  program
    .command("init")
    .description("Create .tickets/ structure")
    .option("--json", "Emit a JSON envelope")
    .action(async (options: { json?: boolean }, command: Command) => {
      const global = getGlobalOptions(command);
      await runInit(process.cwd(), { json: options.json ?? global.json ?? false });
    });

  program
    .command("new")
    .description("Create a new ticket")
    .argument("<title>", "Ticket title")
    .option("-p, --priority <priority>", "Ticket priority", "p1")
    .option("--state <state>", "Initial ticket state", "backlog")
    .option("--label <label>", "Label to add", collectLabel, [])
    .option("--ci", "CI mode (accepted for consistency)")
    .action(async (title: string, options: { priority: string; state: string; label: string[]; ci?: boolean }) => {
      await runNew(process.cwd(), title, options);
    });

  program
    .command("list")
    .description("List tickets from index")
    .option("--state <state>", "Filter by state")
    .option("--label <label>", "Filter by label")
    .option("--format <format>", "Output format: table|kanban", "table")
    .option("--json", "Emit a JSON envelope")
    .option("--ci", "CI mode (accepted for consistency)")
    .action(async (options: { state?: string; label?: string; format?: string; json?: boolean; ci?: boolean }, command: Command) => {
      const global = getGlobalOptions(command);
      await runList(process.cwd(), { ...options, json: options.json ?? global.json ?? false });
    });

  program
    .command("show")
    .description("Show a ticket")
    .argument("<id>", "Ticket id (ULID or short id)")
    .option("--ci", "Enable CI mode (exact id matching only)")
    .option("--json", "Emit a JSON envelope")
    .action(async (id: string, options: { ci?: boolean; json?: boolean }, command: Command) => {
      const global = getGlobalOptions(command);
      await runShow(process.cwd(), id, { ...options, json: options.json ?? global.json ?? false });
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
    .command("edit")
    .description("Edit ticket metadata")
    .argument("<id>", "Ticket id (ULID or short id)")
    .option("--title <title>", "Replace ticket title")
    .option("--priority <priority>", "Change priority (p0-p3)")
    .option("--labels <labels>", "Label update or replacement", collectEditLabels, [])
    .option("--clear-labels", "Remove all labels from the ticket")
    .option("--ci", "Enable CI mode (exact id matching only)")
    .action(async (id: string, options: { title?: string; priority?: string; labels?: string[]; clearLabels?: boolean; ci?: boolean }) => {
      await runEdit(process.cwd(), id, options);
    });

  program
    .command("branch")
    .description("Create or checkout a branch for a ticket")
    .argument("<id>", "Ticket id (ULID or short id)")
    .option("--ci", "Print branch name only; do not switch branches")
    .action(async (id: string, options: { ci?: boolean }) => {
      await runBranch(process.cwd(), id, options);
    });

  program
    .command("validate")
    .description("Validate tickets and index")
    .option("--fix", "Auto-fix supported issues")
    .option("--ci", "CI mode")
    .option("--json", "Emit a JSON envelope")
    .action(async (options: { fix?: boolean; ci?: boolean; json?: boolean }, command: Command) => {
      const global = getGlobalOptions(command);
      await runValidate(process.cwd(), { ...options, json: options.json ?? global.json ?? false });
    });

  program
    .command("install-hooks")
    .description("Install git hooks for automatic validation")
    .option("--force", "Overwrite existing hooks without prompting")
    .action(async (options: { force?: boolean }) => {
      await runInstallHooks(process.cwd(), options);
    });

  program
    .command("rebuild-index")
    .description("Force regenerate index.json from all ticket files")
    .action(async () => {
      await runRebuildIndex(process.cwd());
    });

  // TODO(TK-01KHWGYACV): add telemetry-lane storage plumbing (git notes primary, ref fallback).
  // TODO(TK-01KHWGYAM6): add `ticket events` read/write commands for high-frequency agent chatter.
  // TODO(TK-01KHWGYAM6): add compaction tooling/commands for telemetry lane retention control.

  await program.parseAsync(process.argv);
}

function collectLabel(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function collectEditLabels(value: string, previous: string[]): string[] {
  return [...previous, value];
}

main().catch((error) => {
  void emitCliTelemetry("cli_activation_command_failed", {
    message: error instanceof Error ? error.message : String(error),
  });

  const jsonMode = process.argv.includes("--json");
  if (jsonMode) {
    writeEnvelope(failureEnvelope(error));
    if (error instanceof TicketError) {
      process.exitCode = error.exitCode;
      return;
    }
    process.exitCode = EXIT_CODE.UNEXPECTED;
    return;
  }

  if (error instanceof TicketError) {
    console.error(error.message);
    process.exitCode = error.exitCode;
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = EXIT_CODE.UNEXPECTED;
});
