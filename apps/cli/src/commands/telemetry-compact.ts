import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { buildTelemetryCompactionPlan } from "../lib/telemetry-compaction.js";
import { listTelemetryEvents, resolveTelemetrySettings, type CliTelemetryPayload } from "../lib/telemetry.js";

const execFileAsync = promisify(execFile);

export interface TelemetryCompactOptions {
  apply?: boolean;
}

async function execGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  return stdout.trim();
}

async function execGitAllowError(cwd: string, args: string[]): Promise<string | null> {
  try {
    return await execGit(cwd, args);
  } catch {
    return null;
  }
}

async function withTempFile<T>(contents: string, fn: (filePath: string) => Promise<T>): Promise<T> {
  const tempPath = path.join(
    os.tmpdir(),
    `ticket-telemetry-compact-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`
  );
  await fs.writeFile(tempPath, contents, "utf8");
  try {
    return await fn(tempPath);
  } finally {
    await fs.rm(tempPath, { force: true });
  }
}

function toNdjson(events: CliTelemetryPayload[]): string {
  return events.map((event) => JSON.stringify(event)).join("\n").concat(events.length > 0 ? "\n" : "");
}

async function hasRef(cwd: string, ref: string): Promise<boolean> {
  const resolved = await execGitAllowError(cwd, ["rev-parse", "--verify", ref]);
  return Boolean(resolved);
}

async function backupRef(cwd: string, sourceRef: string, backupRefName: string): Promise<boolean> {
  const sourceSha = await execGitAllowError(cwd, ["rev-parse", "--verify", sourceRef]);
  if (!sourceSha) {
    return false;
  }
  await execGit(cwd, ["update-ref", backupRefName, sourceSha]);
  return true;
}

async function rewriteEventRef(cwd: string, eventRef: string, snapshots: CliTelemetryPayload[]): Promise<void> {
  const contents = toNdjson(snapshots);
  const blobSha = await withTempFile(contents, async (filePath) => execGit(cwd, ["hash-object", "-w", filePath]));
  await execGit(cwd, ["update-ref", eventRef, blobSha]);
}

async function rewriteNotesRef(cwd: string, notesRef: string, snapshots: CliTelemetryPayload[]): Promise<void> {
  const list = await execGitAllowError(cwd, ["notes", "--ref", notesRef, "list"]);
  if (list) {
    const entries = list
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split(/\s+/))
      .filter((parts) => parts.length >= 2)
      .map((parts) => parts[1]);
    for (const annotatedObject of entries) {
      await execGitAllowError(cwd, ["notes", "--ref", notesRef, "remove", annotatedObject]);
    }
  }

  for (const snapshot of snapshots) {
    const anchor = await withTempFile(
      `ticket-telemetry-event:${snapshot.id}`,
      async (filePath) => execGit(cwd, ["hash-object", "-w", filePath])
    );
    await withTempFile(toNdjson([snapshot]), async (filePath) => {
      await execGit(cwd, ["notes", "--ref", notesRef, "add", "-f", "-F", filePath, anchor]);
    });
  }
}

export async function runTelemetryCompact(cwd: string, options: TelemetryCompactOptions): Promise<void> {
  const settings = await resolveTelemetrySettings(cwd);
  const events = await listTelemetryEvents(cwd, {}, settings);
  const plan = buildTelemetryCompactionPlan(events);

  console.log(`Telemetry compaction plan`);
  console.log(`- source events: ${plan.sourceEventCount}`);
  console.log(`- compact snapshots: ${plan.snapshotCount}`);
  console.log(`- reduced entries: ${plan.reductionCount}`);
  console.log(`- notes ref: ${settings.notesRef}`);
  console.log(`- event ref: ${settings.eventRef}`);

  if (plan.sourceEventCount === 0) {
    console.log("No telemetry events found. Nothing to compact.");
    return;
  }

  if (!options.apply) {
    console.log("");
    console.log("Dry-run only. Re-run with --apply to persist compact snapshots.");
    console.log("Verification:");
    console.log("  ticket validate --ci");
    console.log("  git notes --ref " + settings.notesRef + " list");
    console.log("  git show " + settings.eventRef);
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const notesBackupRef = `refs/tickets/backups/telemetry-notes-${stamp}`;
  const eventBackupRef = `refs/tickets/backups/telemetry-event-${stamp}`;

  const notesBackedUp = await backupRef(cwd, settings.notesRef, notesBackupRef);
  const eventBackedUp = await backupRef(cwd, settings.eventRef, eventBackupRef);

  const notesExists = await hasRef(cwd, settings.notesRef);
  if (notesExists) {
    await rewriteNotesRef(cwd, settings.notesRef, plan.snapshots);
  }
  await rewriteEventRef(cwd, settings.eventRef, plan.snapshots);

  console.log("");
  console.log("Applied compaction snapshot backfill.");
  console.log(`- wrote snapshots: ${plan.snapshotCount}`);
  if (notesBackedUp) {
    console.log(`- notes backup: ${notesBackupRef}`);
  } else {
    console.log("- notes backup: (none, source ref missing)");
  }
  if (eventBackedUp) {
    console.log(`- event backup: ${eventBackupRef}`);
  } else {
    console.log("- event backup: (none, source ref missing)");
  }
  console.log("");
  console.log("Verification:");
  console.log("  ticket validate --ci");
  console.log("  git notes --ref " + settings.notesRef + " list");
  console.log("  git show " + settings.eventRef);
  console.log("Rollback:");
  if (notesBackedUp) {
    console.log(`  git update-ref ${settings.notesRef} ${notesBackupRef}`);
  }
  if (eventBackedUp) {
    console.log(`  git update-ref ${settings.eventRef} ${eventBackupRef}`);
  }
}
