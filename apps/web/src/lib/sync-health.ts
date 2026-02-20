export type SyncHealthState = "healthy" | "stale" | "error" | "syncing" | "never_synced";

export interface SyncHealthInput {
  syncStatus?: string | null;
  syncError?: string | null;
  lastSyncedAt?: Date | null;
}

export interface SyncHealthSnapshot {
  state: SyncHealthState;
  syncStatus: string;
  lastSyncedAt: string | null;
  ageMs: number | null;
  staleAgeMs: number | null;
  staleAfterMs: number;
  isStale: boolean;
  hasError: boolean;
  errorMessage: string | null;
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const DEFAULT_SYNC_STALE_AFTER_MS = 6 * HOUR_MS;

function parseStaleAfterMsFromEnv(raw: string | undefined): number {
  const minutes = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return DEFAULT_SYNC_STALE_AFTER_MS;
  }
  return minutes * MINUTE_MS;
}

export function getSyncStaleAfterMs(): number {
  return parseStaleAfterMsFromEnv(process.env.SYNC_STALE_AFTER_MINUTES);
}

export function computeSyncHealth(
  input: SyncHealthInput,
  options?: { nowMs?: number; staleAfterMs?: number },
): SyncHealthSnapshot {
  const nowMs = options?.nowMs ?? Date.now();
  const staleAfterMs = options?.staleAfterMs ?? getSyncStaleAfterMs();
  const syncStatus = input.syncStatus ?? "idle";
  const hasError = syncStatus === "error" || Boolean(input.syncError);
  const lastSyncedMs = input.lastSyncedAt?.getTime() ?? null;
  const ageMs = lastSyncedMs === null ? null : Math.max(0, nowMs - lastSyncedMs);
  const isStale = ageMs !== null && ageMs > staleAfterMs;
  const staleAgeMs = ageMs === null ? null : Math.max(0, ageMs - staleAfterMs);

  let state: SyncHealthState;
  if (hasError) {
    state = "error";
  } else if (syncStatus === "syncing") {
    state = "syncing";
  } else if (ageMs === null) {
    state = "never_synced";
  } else if (isStale) {
    state = "stale";
  } else {
    state = "healthy";
  }

  return {
    state,
    syncStatus,
    lastSyncedAt: input.lastSyncedAt?.toISOString() ?? null,
    ageMs,
    staleAgeMs,
    staleAfterMs,
    isStale,
    hasError,
    errorMessage: input.syncError ?? null,
  };
}

export function formatDurationShort(ms: number | null): string {
  if (ms === null) {
    return "n/a";
  }
  if (ms < MINUTE_MS) {
    return "<1m";
  }
  if (ms < HOUR_MS) {
    return `${Math.floor(ms / MINUTE_MS)}m`;
  }
  if (ms < DAY_MS) {
    return `${Math.floor(ms / HOUR_MS)}h`;
  }
  return `${Math.floor(ms / DAY_MS)}d`;
}
