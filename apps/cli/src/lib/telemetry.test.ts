import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listTelemetryEvents,
  readTelemetryEvent,
  resolveTelemetrySettings,
  writeTelemetryEvent,
  type CliTelemetryPayload,
  type TelemetrySettings
} from "./telemetry.js";

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  return stdout.trim();
}

async function mkGitRepo(withCommit: boolean): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ticket-telemetry-test-"));
  tempDirs.push(dir);

  await git(dir, "init");
  await git(dir, "config", "user.email", "tests@example.com");
  await git(dir, "config", "user.name", "Ticket Tests");

  if (withCommit) {
    await fs.writeFile(path.join(dir, "README.md"), "# test\n", "utf8");
    await git(dir, "add", "README.md");
    await git(dir, "commit", "-m", "init");
  }
  return dir;
}

function fixedPayload(id: string, event: string, at: string): CliTelemetryPayload {
  return {
    id,
    event,
    source: "cli",
    at,
    properties: { command: "test" }
  };
}

describe("telemetry lane", () => {
  it("writes and reads events from git notes backend", async () => {
    const cwd = await mkGitRepo(true);
    const settings: TelemetrySettings = {
      backend: "notes",
      notesRef: "refs/notes/ticket-events",
      eventRef: "refs/tickets/events",
      writeFallback: true,
      readFallback: true
    };

    const payload = fixedPayload("evt-notes-1", "cli_command_started", "2026-02-20T12:00:00.000Z");
    await writeTelemetryEvent(cwd, payload, settings);

    const notesList = await git(cwd, "notes", "--ref", settings.notesRef, "list");
    const annotatedObject = notesList.split(/\s+/)[1];
    const noteBody = await git(cwd, "notes", "--ref", settings.notesRef, "show", annotatedObject);
    expect(noteBody).toContain("\"id\":\"evt-notes-1\"");

    const listed = await listTelemetryEvents(cwd, {}, settings);
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe("evt-notes-1");

    const read = await readTelemetryEvent(cwd, "evt-notes-1", settings);
    expect(read?.event).toBe("cli_command_started");
  });

  it("falls back to event ref when notes are unavailable", async () => {
    const cwd = await mkGitRepo(false);
    const settings: TelemetrySettings = {
      backend: "notes",
      notesRef: "refs////",
      eventRef: "refs/tickets/events",
      writeFallback: true,
      readFallback: true
    };

    const payload = fixedPayload("evt-fallback-1", "cli_command_failed", "2026-02-20T12:05:00.000Z");
    const backend = await writeTelemetryEvent(cwd, payload, settings);
    expect(backend).toBe("event_ref");

    const rawRef = await git(cwd, "show", settings.eventRef);
    expect(rawRef).toContain("\"id\":\"evt-fallback-1\"");

    const listed = await listTelemetryEvents(cwd, {}, settings);
    expect(listed.map((entry) => entry.id)).toEqual(["evt-fallback-1"]);
  });

  it("writes notes telemetry without requiring HEAD and stores one note per event", async () => {
    const cwd = await mkGitRepo(false);
    const settings: TelemetrySettings = {
      backend: "notes",
      notesRef: "refs/notes/ticket-events",
      eventRef: "refs/tickets/events",
      writeFallback: true,
      readFallback: true
    };

    const first = fixedPayload("evt-notes-2", "ticket_viewed", "2026-02-20T12:11:00.000Z");
    const second = fixedPayload("evt-notes-3", "ticket_moved", "2026-02-20T12:12:00.000Z");

    const backendOne = await writeTelemetryEvent(cwd, first, settings);
    const backendTwo = await writeTelemetryEvent(cwd, second, settings);
    expect(backendOne).toBe("notes");
    expect(backendTwo).toBe("notes");

    const notesEntries = await git(cwd, "notes", "--ref", settings.notesRef, "list");
    const lines = notesEntries.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    expect(lines).toHaveLength(2);

    const listed = await listTelemetryEvents(cwd, {}, settings);
    expect(listed.map((entry) => entry.id)).toEqual(["evt-notes-2", "evt-notes-3"]);
  });

  it("supports direct event ref backend writes and deterministic ordering", async () => {
    const cwd = await mkGitRepo(false);
    const settings: TelemetrySettings = {
      backend: "event_ref",
      notesRef: "refs/notes/ticket-events",
      eventRef: "refs/tickets/events",
      writeFallback: true,
      readFallback: true
    };

    await writeTelemetryEvent(cwd, fixedPayload("evt-2", "two", "2026-02-20T12:10:00.000Z"), settings);
    await writeTelemetryEvent(cwd, fixedPayload("evt-1", "one", "2026-02-20T12:09:00.000Z"), settings);

    const listed = await listTelemetryEvents(cwd, {}, settings);
    expect(listed.map((entry) => entry.id)).toEqual(["evt-1", "evt-2"]);
  });

  it("reads telemetry settings from config and env overrides", async () => {
    const cwd = await mkGitRepo(false);
    await fs.mkdir(path.join(cwd, ".tickets"), { recursive: true });
    await fs.writeFile(path.join(cwd, ".tickets/config.yml"), `format_version: 1
telemetry:
  backend: notes
  notes_ref: refs/notes/custom-events
  event_ref: refs/tickets/custom-events
  write_fallback: false
  read_fallback: false
`, "utf8");

    const fromConfig = await resolveTelemetrySettings(cwd, {});
    expect(fromConfig.backend).toBe("notes");
    expect(fromConfig.notesRef).toBe("refs/notes/custom-events");
    expect(fromConfig.eventRef).toBe("refs/tickets/custom-events");
    expect(fromConfig.writeFallback).toBe(false);
    expect(fromConfig.readFallback).toBe(false);

    const fromEnv = await resolveTelemetrySettings(cwd, {
      TICKET_TELEMETRY_BACKEND: "event_ref",
      TICKET_TELEMETRY_WRITE_FALLBACK: "true",
      TICKET_TELEMETRY_READ_FALLBACK: "true"
    });
    expect(fromEnv.backend).toBe("event_ref");
    expect(fromEnv.writeFallback).toBe(true);
    expect(fromEnv.readFallback).toBe(true);
  });
});
