import type { CliTelemetryPayload } from "./telemetry.js";

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const DISPLAY_ID_RE = /^TK-[A-Z0-9]+$/;

export interface TelemetryCompactionGroup {
  key: string;
  ticketId: string | null;
  from: string;
  to: string;
  totalEvents: number;
  eventCounts: Record<string, number>;
}

export interface TelemetryCompactionPlan {
  sourceEventCount: number;
  snapshotCount: number;
  reductionCount: number;
  groups: TelemetryCompactionGroup[];
  snapshots: CliTelemetryPayload[];
}

function toStableSortValue(at: string): number {
  const epoch = Date.parse(at);
  return Number.isNaN(epoch) ? 0 : epoch;
}

function normalizeTicketToken(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const upper = trimmed.toUpperCase();
  if (DISPLAY_ID_RE.test(upper)) {
    return upper;
  }
  if (ULID_RE.test(upper)) {
    return upper;
  }
  return null;
}

export function extractTelemetryTicketId(payload: CliTelemetryPayload): string | null {
  const props = payload.properties;
  if (!props || typeof props !== "object") {
    return null;
  }

  const keys = ["ticket_id", "ticketId", "display_id", "displayId", "id"];
  for (const key of keys) {
    const value = props[key];
    if (typeof value !== "string") {
      continue;
    }
    const normalized = normalizeTicketToken(value);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

export function toCompactionGroupKey(payload: CliTelemetryPayload): { key: string; ticketId: string | null } {
  const ticketId = extractTelemetryTicketId(payload);
  if (ticketId) {
    return { key: `ticket:${ticketId}`, ticketId };
  }
  return { key: `event:${payload.event}`, ticketId: null };
}

export function buildTelemetryCompactionPlan(events: CliTelemetryPayload[]): TelemetryCompactionPlan {
  if (events.length === 0) {
    return {
      sourceEventCount: 0,
      snapshotCount: 0,
      reductionCount: 0,
      groups: [],
      snapshots: []
    };
  }

  const sortedEvents = [...events].sort((a, b) => {
    const aEpoch = toStableSortValue(a.at);
    const bEpoch = toStableSortValue(b.at);
    if (aEpoch !== bEpoch) {
      return aEpoch - bEpoch;
    }
    return a.id.localeCompare(b.id);
  });

  const groups = new Map<string, TelemetryCompactionGroup>();
  for (const event of sortedEvents) {
    const { key, ticketId } = toCompactionGroupKey(event);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        key,
        ticketId,
        from: event.at,
        to: event.at,
        totalEvents: 1,
        eventCounts: { [event.event]: 1 }
      });
      continue;
    }

    existing.to = event.at;
    existing.totalEvents += 1;
    existing.eventCounts[event.event] = (existing.eventCounts[event.event] ?? 0) + 1;
  }

  const orderedGroups = [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
  const snapshots: CliTelemetryPayload[] = orderedGroups.map((group, index) => ({
    id: `snap-${String(index + 1).padStart(4, "0")}`,
    event: "telemetry_compaction_snapshot",
    source: "cli",
    at: group.to,
    properties: {
      snapshot_version: 1,
      key: group.key,
      ticket_id: group.ticketId,
      from: group.from,
      to: group.to,
      total_events: group.totalEvents,
      event_counts: group.eventCounts
    }
  }));

  return {
    sourceEventCount: events.length,
    snapshotCount: snapshots.length,
    reductionCount: events.length - snapshots.length,
    groups: orderedGroups,
    snapshots
  };
}
