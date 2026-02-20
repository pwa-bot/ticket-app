#!/usr/bin/env node

import { Command, Option } from "commander";
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
import { runTelemetryCompact } from "./commands/telemetry-compact.js";
import { runEventsCompact, runEventsRead, runEventsWrite } from "./commands/events.js";
import { EXIT_CODE, TicketError } from "./lib/errors.js";
import { failureEnvelope, writeEnvelope } from "./lib/json.js";
import { setNoCommitMode, setQuietMode } from "./lib/output.js";
import { emitCliTelemetry } from "./lib/telemetry.js";

interface GlobalCliOptions {
  json?: boolean;
  quiet?: boolean;
  noCommit?: boolean;
}

function extractTicketErrorWarnings(error: TicketError): string[] {
  const warnings = (error.details as { warnings?: unknown } | undefined)?.warnings;
  if (!Array.isArray(warnings)) {
    return [];
  }
  return warnings.filter((warning): warning is string => typeof warning === "string" && warning.length > 0);
}

function getGlobalOptions(command: Command): GlobalCliOptions {
  return command.optsWithGlobals<GlobalCliOptions>();
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("ticket")
    .description("Git-native issue tracking CLI")
    .version("0.1.2")
    .option("--json", "Emit a JSON envelope")
    .option("-q, --quiet", "Suppress success output")
    .option("--no-commit", "Skip auto-commit (for dev/testing)")
    .hook("preAction", async (thisCommand, actionCommand) => {
      const opts = thisCommand.optsWithGlobals<GlobalCliOptions>();
      setQuietMode(opts.quiet ?? false);
      setNoCommitMode(opts.noCommit ?? false);

      const commandName = actionCommand.name();
      await emitCliTelemetry("cli_activation_command_started", {
        command: commandName,
        args: actionCommand.args.length,
      });
    })
    .hook("postAction", async (_thisCommand, actionCommand) => {
      await emitCliTelemetry("cli_activation_command_succeeded", {
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
    .option("--template <template>", "Template name from .tickets/templates (e.g. bug, feature, chore)")
    .option("--label <label>", "Label to add", collectLabel, [])
    .option("--ci", "CI mode (accepted for consistency)")
    .action(async (title: string, options: { priority: string; state: string; template?: string; label: string[]; ci?: boolean }) => {
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
    .argument("<id>", "Ticket id (ULID, display_id, or short_id)")
    .option("--ci", "Enable CI mode (exact id matching only)")
    .option("--json", "Emit a JSON envelope")
    .action(async (id: string, options: { ci?: boolean; json?: boolean }, command: Command) => {
      const global = getGlobalOptions(command);
      await runShow(process.cwd(), id, { ...options, json: options.json ?? global.json ?? false });
    });

  program
    .command("move")
    .description("Move a ticket to a new state")
    .argument("<id>", "Ticket id (ULID, display_id, or short_id)")
    .argument("<state>", "Target state")
    .option("--ci", "Enable CI mode (exact id matching only)")
    .action(async (id: string, state: string, options: { ci?: boolean }) => {
      await runMove(process.cwd(), id, state, options);
    });

  program
    .command("start")
    .description("Move a ticket to in_progress")
    .argument("<id>", "Ticket id (ULID, display_id, or short_id)")
    .option("--ci", "Enable CI mode (exact id matching only)")
    .action(async (id: string, options: { ci?: boolean }) => {
      await runStart(process.cwd(), id, options);
    });

  program
    .command("done")
    .description("Move a ticket to done")
    .argument("<id>", "Ticket id (ULID, display_id, or short_id)")
    .option("--ci", "Enable CI mode (exact id matching only)")
    .action(async (id: string, options: { ci?: boolean }) => {
      await runDone(process.cwd(), id, options);
    });

  program
    .command("assign")
    .description("Set the assignee for a ticket")
    .argument("<id>", "Ticket id (ULID, display_id, or short_id)")
    .argument("<actor>", "Actor (human:<slug> or agent:<slug>)")
    .option("--ci", "Enable CI mode (exact id matching only)")
    .action(async (id: string, actor: string, options: { ci?: boolean }) => {
      await runAssign(process.cwd(), id, actor, options);
    });

  program
    .command("reviewer")
    .description("Set the reviewer for a ticket")
    .argument("<id>", "Ticket id (ULID, display_id, or short_id)")
    .argument("<actor>", "Actor (human:<slug> or agent:<slug>)")
    .option("--ci", "Enable CI mode (exact id matching only)")
    .action(async (id: string, actor: string, options: { ci?: boolean }) => {
      await runReviewer(process.cwd(), id, actor, options);
    });

  program
    .command("edit")
    .description("Edit ticket metadata")
    .argument("<id>", "Ticket id (ULID, display_id, or short_id)")
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
    .argument("<id>", "Ticket id (ULID, display_id, or short_id)")
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
    .addOption(
      new Option("--policy-tier <tier>", "Policy tier: hard|integrity|warn|quality|opt-in|strict")
        .choices(["hard", "integrity", "warn", "quality", "opt-in", "strict"])
    )
    .action(async (options: { fix?: boolean; ci?: boolean; json?: boolean; policyTier?: string }, command: Command) => {
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

  program
    .command("telemetry-compact")
    .description("Backfill telemetry history into compact snapshots (legacy alias: prefer `ticket events compact`)")
    .option("--apply", "Apply compaction plan and rewrite telemetry refs")
    .action(async (options: { apply?: boolean }) => {
      await runTelemetryCompact(process.cwd(), options);
    });

  const events = program
    .command("events")
    .description("Read, write, and compact telemetry lane events");

  events
    .command("write")
    .description("Append a telemetry event to the configured backend")
    .argument("<event>", "Event name")
    .option("--id <id>", "Explicit event id (defaults to generated id)")
    .option("--at <timestamp>", "Event timestamp (ISO-8601)")
    .option("--ticket <ticket>", "Attach ticket identifier as properties.ticket_id")
    .option("--prop <key=value>", "Attach event property", collectLabel, [])
    .option("--json", "Emit a JSON envelope")
    .action(async (eventName: string, options: { id?: string; at?: string; ticket?: string; prop?: string[]; json?: boolean }, command: Command) => {
      const global = getGlobalOptions(command);
      await runEventsWrite(process.cwd(), eventName, { ...options, json: options.json ?? global.json ?? false });
    });

  events
    .command("read")
    .description("Read telemetry events from the configured backend")
    .option("--id <id>", "Read a single event by id")
    .option("--limit <n>", "Return only the most recent N events")
    .option("--compact", "Render one compact line per event")
    .option("--json", "Emit a JSON envelope")
    .action(async (options: { id?: string; limit?: string; compact?: boolean; json?: boolean }, command: Command) => {
      const global = getGlobalOptions(command);
      await runEventsRead(process.cwd(), { ...options, json: options.json ?? global.json ?? false });
    });

  events
    .command("compact")
    .description("Backfill telemetry history into compact snapshots (dry-run by default)")
    .option("--apply", "Apply compaction plan and rewrite telemetry refs")
    .action(async (options: { apply?: boolean }) => {
      await runEventsCompact(process.cwd(), options);
    });

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
    for (const warning of extractTicketErrorWarnings(error)) {
      console.error(`Warning: ${warning}`);
    }
    console.error(error.message);
    process.exitCode = error.exitCode;
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = EXIT_CODE.UNEXPECTED;
});
