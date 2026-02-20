import { ERROR_CODE, EXIT_CODE, TicketError } from "../lib/errors.js";
import { successEnvelope, writeEnvelope } from "../lib/json.js";
import { now } from "../lib/ulid.js";
import {
  listTelemetryEvents,
  readTelemetryEvent,
  resolveTelemetrySettings,
  writeTelemetryEvent,
  type CliTelemetryPayload
} from "../lib/telemetry.js";
import { extractTelemetryTicketId } from "../lib/telemetry-compaction.js";
import { runTelemetryCompact, type TelemetryCompactOptions } from "./telemetry-compact.js";

export interface EventsWriteOptions {
  id?: string;
  at?: string;
  ticket?: string;
  prop?: string[];
  json?: boolean;
}

export interface EventsReadOptions {
  id?: string;
  limit?: string | number;
  compact?: boolean;
  json?: boolean;
}

function parseLimit(value: string | number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new TicketError(
      ERROR_CODE.VALIDATION_FAILED,
      "Invalid --limit value. Must be a positive integer.",
      EXIT_CODE.USAGE,
      { value }
    );
  }
  return parsed;
}

function parsePropertyValue(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  if (trimmed === "null") {
    return null;
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const asNumber = Number(trimmed);
    if (!Number.isNaN(asNumber)) {
      return asNumber;
    }
  }
  return trimmed;
}

function parseProps(pairs: string[] | undefined): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const pair of pairs ?? []) {
    const eq = pair.indexOf("=");
    if (eq <= 0) {
      throw new TicketError(
        ERROR_CODE.VALIDATION_FAILED,
        "Invalid --prop value. Expected key=value.",
        EXIT_CODE.USAGE,
        { value: pair }
      );
    }

    const key = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1);
    if (!key) {
      throw new TicketError(
        ERROR_CODE.VALIDATION_FAILED,
        "Invalid --prop key. Expected non-empty key in key=value.",
        EXIT_CODE.USAGE,
        { value: pair }
      );
    }

    props[key] = parsePropertyValue(value);
  }
  return props;
}

function toCompactLine(event: CliTelemetryPayload): string {
  const ticketId = extractTelemetryTicketId(event);
  const ticketSuffix = ticketId ? ` ticket=${ticketId}` : "";
  return `${event.at} ${event.id} ${event.event}${ticketSuffix}`;
}

function renderEvents(events: CliTelemetryPayload[], compact: boolean): void {
  if (events.length === 0) {
    console.log("No events found.");
    return;
  }

  if (compact) {
    for (const event of events) {
      console.log(toCompactLine(event));
    }
    return;
  }

  for (const event of events) {
    console.log(`${event.at} ${event.event} (${event.id})`);
    if (event.properties && Object.keys(event.properties).length > 0) {
      console.log(`  properties: ${JSON.stringify(event.properties)}`);
    }
  }
}

export async function runEventsWrite(cwd: string, eventName: string, options: EventsWriteOptions): Promise<void> {
  const event = eventName.trim();
  if (!event) {
    throw new TicketError(ERROR_CODE.VALIDATION_FAILED, "Event name must be non-empty.", EXIT_CODE.USAGE);
  }

  const at = options.at ?? now().toISOString();
  const parsedAt = Date.parse(at);
  if (Number.isNaN(parsedAt)) {
    throw new TicketError(
      ERROR_CODE.VALIDATION_FAILED,
      "Invalid --at timestamp. Use ISO-8601 format.",
      EXIT_CODE.USAGE,
      { at }
    );
  }

  const properties = parseProps(options.prop);
  if (options.ticket) {
    properties.ticket_id = options.ticket;
  }

  const payload: CliTelemetryPayload = {
    id: options.id?.trim() || `evt-${Date.now()}`,
    event,
    source: "cli",
    at: new Date(parsedAt).toISOString(),
    properties: Object.keys(properties).length > 0 ? properties : undefined
  };

  const settings = await resolveTelemetrySettings(cwd);
  const backend = await writeTelemetryEvent(cwd, payload, settings);

  if (options.json) {
    writeEnvelope(successEnvelope({ event: payload, backend }));
    return;
  }

  console.log(`Wrote event ${payload.id} to ${backend}.`);
}

export async function runEventsRead(cwd: string, options: EventsReadOptions): Promise<void> {
  const compact = options.compact ?? false;
  const limit = parseLimit(options.limit);
  const settings = await resolveTelemetrySettings(cwd);

  if (options.id) {
    const event = await readTelemetryEvent(cwd, options.id, settings);
    if (!event) {
      throw new TicketError(
        ERROR_CODE.TICKET_NOT_FOUND,
        `Telemetry event not found: ${options.id}`,
        EXIT_CODE.NOT_FOUND,
        { id: options.id }
      );
    }

    if (options.json) {
      writeEnvelope(successEnvelope({ events: [event], count: 1, compact }));
      return;
    }

    renderEvents([event], compact);
    return;
  }

  const events = await listTelemetryEvents(cwd, { limit }, settings);
  if (options.json) {
    writeEnvelope(successEnvelope({ events, count: events.length, compact }));
    return;
  }

  renderEvents(events, compact);
}

export async function runEventsCompact(cwd: string, options: TelemetryCompactOptions): Promise<void> {
  await runTelemetryCompact(cwd, options);
}
