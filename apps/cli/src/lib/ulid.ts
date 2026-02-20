import { ulid, monotonicFactory } from "ulid";

/**
 * Get the current timestamp, respecting SOURCE_DATE_EPOCH for reproducible builds.
 * https://reproducible-builds.org/docs/source-date-epoch/
 */
export function now(): Date {
  const epoch = process.env.SOURCE_DATE_EPOCH;
  if (epoch) {
    const ms = parseInt(epoch, 10) * 1000;
    if (!Number.isNaN(ms)) {
      return new Date(ms);
    }
  }
  return new Date();
}

// Use monotonic factory for consistent ordering within same millisecond
const ulidFactory = monotonicFactory();

/**
 * Generate a ticket ID (ULID).
 * Respects SOURCE_DATE_EPOCH for reproducible test output.
 */
export function generateTicketId(): string {
  const seedTime = now().getTime();
  return ulidFactory(seedTime).toUpperCase();
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}

export function displayId(id: string, sequence?: number): string {
  const base = `TK-${shortId(id)}`;
  if (sequence == null || sequence <= 1) {
    return base;
  }
  return `${base}-${sequence}`;
}
