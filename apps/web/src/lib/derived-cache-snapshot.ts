import crypto from "node:crypto";
import { computeSyncHealth, type SyncHealthInput } from "@/lib/sync-health";

export const DERIVED_CACHE_SNAPSHOT_VERSION = 1;

export interface TicketIndexEntry {
  id: string;
  short_id?: string;
  display_id?: string;
  title?: string;
  state?: string;
  priority?: string;
  labels?: string[];
  assignee?: string | null;
  reviewer?: string | null;
  path?: string;
  created?: string;
  updated?: string;
}

export interface TicketIndexJson {
  format_version: number;
  tickets: TicketIndexEntry[];
}

export interface VersionedTicketIndexSnapshotV1 {
  snapshotVersion: 1;
  repoId: string;
  repoFullName: string;
  headSha: string | null;
  indexSha: string;
  capturedAt: string;
  payloadHash: string;
  payload: TicketIndexJson;
}

export type VersionedTicketIndexSnapshot = VersionedTicketIndexSnapshotV1;

export interface SnapshotFallbackDecision {
  shouldFallback: boolean;
  reason: "stale_cache" | "sync_error" | "cache_corrupted" | "empty_cache" | null;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(obj[key])}`).join(",")}}`;
}

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function isValidTicketIndexEntry(entry: unknown): entry is TicketIndexEntry {
  if (!entry || typeof entry !== "object") {
    return false;
  }

  const ticket = entry as Partial<TicketIndexEntry>;
  if (typeof ticket.id !== "string" || ticket.id.trim().length === 0) {
    return false;
  }

  if (ticket.path !== undefined && typeof ticket.path !== "string") {
    return false;
  }

  if (ticket.title !== undefined && typeof ticket.title !== "string") {
    return false;
  }

  if (ticket.state !== undefined && typeof ticket.state !== "string") {
    return false;
  }

  if (ticket.priority !== undefined && typeof ticket.priority !== "string") {
    return false;
  }

  if (ticket.labels !== undefined && !Array.isArray(ticket.labels)) {
    return false;
  }

  return true;
}

export function isValidTicketIndexJson(value: unknown): value is TicketIndexJson {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<TicketIndexJson>;
  if (payload.format_version !== 1 || !Array.isArray(payload.tickets)) {
    return false;
  }

  return payload.tickets.every((ticket) => isValidTicketIndexEntry(ticket));
}

export function createVersionedTicketIndexSnapshot(input: {
  repoId: string;
  repoFullName: string;
  headSha: string | null;
  indexSha: string;
  capturedAt: Date;
  payload: TicketIndexJson;
}): VersionedTicketIndexSnapshotV1 {
  if (!isValidTicketIndexJson(input.payload)) {
    throw new Error("invalid_ticket_index_payload");
  }

  const payloadHash = sha256Hex(canonicalize(input.payload));

  return {
    snapshotVersion: DERIVED_CACHE_SNAPSHOT_VERSION,
    repoId: input.repoId,
    repoFullName: input.repoFullName,
    headSha: input.headSha,
    indexSha: input.indexSha,
    capturedAt: input.capturedAt.toISOString(),
    payloadHash,
    payload: input.payload,
  };
}

export function parseVersionedTicketIndexSnapshot(value: unknown): VersionedTicketIndexSnapshotV1 | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const snapshot = value as Partial<VersionedTicketIndexSnapshotV1>;
  if (snapshot.snapshotVersion !== DERIVED_CACHE_SNAPSHOT_VERSION) {
    return null;
  }

  if (typeof snapshot.repoId !== "string" || snapshot.repoId.length === 0) {
    return null;
  }

  if (typeof snapshot.repoFullName !== "string" || snapshot.repoFullName.length === 0) {
    return null;
  }

  if (snapshot.headSha !== null && snapshot.headSha !== undefined && typeof snapshot.headSha !== "string") {
    return null;
  }

  if (typeof snapshot.indexSha !== "string" || snapshot.indexSha.length === 0) {
    return null;
  }

  if (typeof snapshot.capturedAt !== "string" || Number.isNaN(Date.parse(snapshot.capturedAt))) {
    return null;
  }

  if (typeof snapshot.payloadHash !== "string" || snapshot.payloadHash.length === 0) {
    return null;
  }

  if (!isValidTicketIndexJson(snapshot.payload)) {
    return null;
  }

  const expectedHash = sha256Hex(canonicalize(snapshot.payload));
  if (snapshot.payloadHash !== expectedHash) {
    return null;
  }

  return {
    snapshotVersion: DERIVED_CACHE_SNAPSHOT_VERSION,
    repoId: snapshot.repoId,
    repoFullName: snapshot.repoFullName,
    headSha: snapshot.headSha ?? null,
    indexSha: snapshot.indexSha,
    capturedAt: snapshot.capturedAt,
    payloadHash: snapshot.payloadHash,
    payload: snapshot.payload,
  };
}

export function shouldFallbackToLastKnownGoodSnapshot(input: {
  sync: SyncHealthInput;
  ticketCount: number;
  hasCorruption: boolean;
  nowMs?: number;
  staleAfterMs?: number;
}): SnapshotFallbackDecision {
  if (input.hasCorruption) {
    return { shouldFallback: true, reason: "cache_corrupted" };
  }

  const health = computeSyncHealth(input.sync, {
    nowMs: input.nowMs,
    staleAfterMs: input.staleAfterMs,
  });

  if (health.state === "error") {
    return { shouldFallback: true, reason: "sync_error" };
  }

  if (health.state === "stale") {
    return { shouldFallback: true, reason: "stale_cache" };
  }

  if (health.state !== "never_synced" && input.ticketCount === 0) {
    return { shouldFallback: true, reason: "empty_cache" };
  }

  return { shouldFallback: false, reason: null };
}
