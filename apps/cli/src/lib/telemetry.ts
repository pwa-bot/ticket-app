import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { generateTicketId, now } from "./ulid.js";

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 700;
const DEFAULT_NOTES_REF = "refs/notes/ticket-events";
const DEFAULT_EVENT_REF = "refs/tickets/events";

export type TelemetryBackend = "off" | "http" | "notes" | "event_ref";

export interface CliTelemetryPayload {
  id: string;
  event: string;
  source: "cli";
  properties?: Record<string, unknown>;
  at: string;
}

export interface TelemetrySettings {
  backend: TelemetryBackend;
  notesRef: string;
  eventRef: string;
  writeFallback: boolean;
  readFallback: boolean;
  telemetryUrl?: string;
}

interface TelemetryReadOptions {
  limit?: number;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function stripYamlStringQuotes(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\""))
      || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function normalizeBackend(value: string | undefined): TelemetryBackend | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "notes" || normalized === "event_ref" || normalized === "off" || normalized === "http") {
    return normalized;
  }
  return undefined;
}

interface PartialTelemetrySettings {
  backend?: TelemetryBackend;
  notesRef?: string;
  eventRef?: string;
  writeFallback?: boolean;
  readFallback?: boolean;
}

function parseTelemetryConfigBlock(yaml: string): PartialTelemetrySettings {
  const lines = yaml.split(/\r?\n/);
  const parsed: PartialTelemetrySettings = {};
  let inTelemetry = false;
  let telemetryIndent = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    if (!inTelemetry) {
      const startMatch = line.match(/^(\s*)telemetry:\s*$/);
      if (startMatch) {
        inTelemetry = true;
        telemetryIndent = startMatch[1].length;
      }
      continue;
    }

    const currentIndent = (line.match(/^(\s*)/)?.[1].length ?? 0);
    if (currentIndent <= telemetryIndent) {
      inTelemetry = false;
      continue;
    }

    const keyValue = line.match(/^\s*([a-z_]+)\s*:\s*(.*?)\s*$/);
    if (!keyValue) {
      continue;
    }

    const key = keyValue[1];
    const value = stripYamlStringQuotes(keyValue[2]);

    if (key === "backend") {
      parsed.backend = normalizeBackend(value);
      continue;
    }
    if (key === "notes_ref" && value) {
      parsed.notesRef = value;
      continue;
    }
    if (key === "event_ref" && value) {
      parsed.eventRef = value;
      continue;
    }
    if (key === "write_fallback") {
      parsed.writeFallback = parseBoolean(value);
      continue;
    }
    if (key === "read_fallback") {
      parsed.readFallback = parseBoolean(value);
      continue;
    }
  }

  return parsed;
}

async function readTelemetryConfigFromDisk(cwd: string): Promise<PartialTelemetrySettings> {
  const configPath = path.join(cwd, ".tickets/config.yml");
  try {
    const raw = await fs.readFile(configPath, "utf8");
    return parseTelemetryConfigBlock(raw);
  } catch {
    return {};
  }
}

function withEnvOverride(config: TelemetrySettings, env: NodeJS.ProcessEnv): TelemetrySettings {
  const envBackend = normalizeBackend(env.TICKET_TELEMETRY_BACKEND);
  const envNotesRef = env.TICKET_TELEMETRY_NOTES_REF?.trim();
  const envEventRef = env.TICKET_TELEMETRY_EVENT_REF?.trim();
  const envWriteFallback = parseBoolean(env.TICKET_TELEMETRY_WRITE_FALLBACK);
  const envReadFallback = parseBoolean(env.TICKET_TELEMETRY_READ_FALLBACK);

  return {
    backend: envBackend ?? config.backend,
    notesRef: envNotesRef || config.notesRef,
    eventRef: envEventRef || config.eventRef,
    writeFallback: envWriteFallback ?? config.writeFallback,
    readFallback: envReadFallback ?? config.readFallback,
    telemetryUrl: env.TICKET_APP_TELEMETRY_URL ?? config.telemetryUrl
  };
}

export async function resolveTelemetrySettings(cwd: string, env: NodeJS.ProcessEnv = process.env): Promise<TelemetrySettings> {
  const fromDisk = await readTelemetryConfigFromDisk(cwd);
  const defaultBackend: TelemetryBackend = env.TICKET_APP_TELEMETRY_URL ? "http" : "off";
  const merged: TelemetrySettings = {
    backend: fromDisk.backend ?? defaultBackend,
    notesRef: fromDisk.notesRef ?? DEFAULT_NOTES_REF,
    eventRef: fromDisk.eventRef ?? DEFAULT_EVENT_REF,
    writeFallback: fromDisk.writeFallback ?? true,
    readFallback: fromDisk.readFallback ?? true,
    telemetryUrl: env.TICKET_APP_TELEMETRY_URL
  };
  return withEnvOverride(merged, env);
}

async function execGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    maxBuffer: 5 * 1024 * 1024
  });
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
    `ticket-telemetry-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`
  );
  await fs.writeFile(tempPath, contents, "utf8");
  try {
    return await fn(tempPath);
  } finally {
    await fs.rm(tempPath, { force: true });
  }
}

function toNdjsonLine(payload: CliTelemetryPayload): string {
  return `${JSON.stringify(payload)}\n`;
}

async function buildNotesAnchor(cwd: string, payload: CliTelemetryPayload): Promise<string> {
  const seed = `ticket-telemetry-event:${payload.id}`;
  return withTempFile(seed, async (filePath) => execGit(cwd, ["hash-object", "-w", filePath]));
}

async function writeTelemetryToNotes(cwd: string, payload: CliTelemetryPayload, notesRef: string): Promise<void> {
  const anchor = await buildNotesAnchor(cwd, payload);
  const next = toNdjsonLine(payload);

  await withTempFile(next, async (filePath) => {
    await execGit(cwd, ["notes", "--ref", notesRef, "add", "-f", "-F", filePath, anchor]);
  });
}

async function readTelemetryFromNotes(cwd: string, notesRef: string): Promise<CliTelemetryPayload[]> {
  const notesList = await execGitAllowError(cwd, ["notes", "--ref", notesRef, "list"]);
  if (!notesList) {
    return [];
  }

  const events: CliTelemetryPayload[] = [];
  const lines = notesList.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length < 2) {
      continue;
    }
    const objectSha = parts[1];
    const noteBody = await execGitAllowError(cwd, ["notes", "--ref", notesRef, "show", objectSha]);
    if (!noteBody) {
      continue;
    }
    events.push(...parseTelemetryLines(noteBody));
  }
  return events;
}

async function readEventRefContent(cwd: string, eventRef: string): Promise<string> {
  const existing = await execGitAllowError(cwd, ["show", eventRef]);
  return existing ?? "";
}

async function writeTelemetryToEventRef(cwd: string, payload: CliTelemetryPayload, eventRef: string): Promise<void> {
  const existing = await readEventRefContent(cwd, eventRef);
  const next = `${existing}${existing.endsWith("\n") || !existing ? "" : "\n"}${toNdjsonLine(payload)}`;

  const blobSha = await withTempFile(next, async (filePath) => execGit(cwd, ["hash-object", "-w", filePath]));
  await execGit(cwd, ["update-ref", eventRef, blobSha]);
}

async function readTelemetryFromEventRef(cwd: string, eventRef: string): Promise<CliTelemetryPayload[]> {
  const content = await readEventRefContent(cwd, eventRef);
  if (!content) {
    return [];
  }
  return parseTelemetryLines(content);
}

function parseTelemetryLines(raw: string): CliTelemetryPayload[] {
  const events: CliTelemetryPayload[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed) as Partial<CliTelemetryPayload>;
      if (typeof parsed.event !== "string" || typeof parsed.at !== "string") {
        continue;
      }
      events.push({
        id: typeof parsed.id === "string" && parsed.id ? parsed.id : `evt-${events.length + 1}`,
        event: parsed.event,
        source: "cli",
        at: parsed.at,
        properties: parsed.properties
      });
    } catch {
      // Ignore malformed telemetry entries to keep reads best-effort.
    }
  }
  return events;
}

function dedupeAndSortEvents(events: CliTelemetryPayload[]): CliTelemetryPayload[] {
  const byId = new Map<string, CliTelemetryPayload>();
  for (const event of events) {
    byId.set(event.id, event);
  }

  return [...byId.values()].sort((a, b) => {
    const aEpoch = Date.parse(a.at);
    const bEpoch = Date.parse(b.at);
    const aValue = Number.isNaN(aEpoch) ? 0 : aEpoch;
    const bValue = Number.isNaN(bEpoch) ? 0 : bEpoch;
    if (aValue !== bValue) {
      return aValue - bValue;
    }
    return a.id.localeCompare(b.id);
  });
}

async function emitHttpTelemetry(payload: CliTelemetryPayload, telemetryUrl: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    await fetch(telemetryUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function writeTelemetryEvent(
  cwd: string,
  payload: CliTelemetryPayload,
  settings?: TelemetrySettings
): Promise<"off" | "http" | "notes" | "event_ref"> {
  const resolved = settings ?? await resolveTelemetrySettings(cwd);

  if (resolved.backend === "off") {
    return "off";
  }
  if (resolved.backend === "http") {
    if (!resolved.telemetryUrl) {
      return "off";
    }
    await emitHttpTelemetry(payload, resolved.telemetryUrl);
    return "http";
  }
  if (resolved.backend === "event_ref") {
    await writeTelemetryToEventRef(cwd, payload, resolved.eventRef);
    return "event_ref";
  }

  try {
    await writeTelemetryToNotes(cwd, payload, resolved.notesRef);
    return "notes";
  } catch {
    if (!resolved.writeFallback) {
      throw new Error("telemetry notes write failed and fallback is disabled");
    }
    await writeTelemetryToEventRef(cwd, payload, resolved.eventRef);
    return "event_ref";
  }
}

export async function listTelemetryEvents(
  cwd: string,
  options: TelemetryReadOptions = {},
  settings?: TelemetrySettings
): Promise<CliTelemetryPayload[]> {
  const resolved = settings ?? await resolveTelemetrySettings(cwd);
  let all: CliTelemetryPayload[] = [];

  if (resolved.backend === "notes") {
    const notesEvents = await readTelemetryFromNotes(cwd, resolved.notesRef);
    all = all.concat(notesEvents);
    if (resolved.readFallback) {
      const eventRefEvents = await readTelemetryFromEventRef(cwd, resolved.eventRef);
      all = all.concat(eventRefEvents);
    }
  } else if (resolved.backend === "event_ref") {
    const eventRefEvents = await readTelemetryFromEventRef(cwd, resolved.eventRef);
    all = all.concat(eventRefEvents);
  }

  const sorted = dedupeAndSortEvents(all);
  if (options.limit && options.limit > 0) {
    return sorted.slice(-options.limit);
  }
  return sorted;
}

export async function readTelemetryEvent(
  cwd: string,
  id: string,
  settings?: TelemetrySettings
): Promise<CliTelemetryPayload | null> {
  const events = await listTelemetryEvents(cwd, {}, settings);
  return events.find((event) => event.id === id) ?? null;
}

export async function emitCliTelemetry(event: string, properties?: Record<string, unknown>): Promise<void> {
  const payload: CliTelemetryPayload = {
    id: generateTicketId(),
    event,
    source: "cli",
    properties,
    at: now().toISOString()
  };

  try {
    await writeTelemetryEvent(process.cwd(), payload);
  } catch {
    // CLI must remain offline-safe and never fail due to telemetry.
  }
}
