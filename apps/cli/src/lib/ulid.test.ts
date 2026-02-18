import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateTicketId, now } from "./ulid.js";

describe("ulid determinism", () => {
  const originalEnv = process.env.SOURCE_DATE_EPOCH;

  beforeEach(() => {
    delete process.env.SOURCE_DATE_EPOCH;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.SOURCE_DATE_EPOCH = originalEnv;
    } else {
      delete process.env.SOURCE_DATE_EPOCH;
    }
  });

  it("now() returns current time by default", () => {
    const before = Date.now();
    const result = now().getTime();
    const after = Date.now();
    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });

  it("now() respects SOURCE_DATE_EPOCH", () => {
    process.env.SOURCE_DATE_EPOCH = "1700000000"; // 2023-11-14T22:13:20Z
    const result = now();
    expect(result.toISOString()).toBe("2023-11-14T22:13:20.000Z");
  });

  it("generateTicketId() produces valid ULIDs with SOURCE_DATE_EPOCH", () => {
    process.env.SOURCE_DATE_EPOCH = "1700000000";
    const id1 = generateTicketId();
    const id2 = generateTicketId();
    
    // Both should be valid ULIDs
    expect(id1).toMatch(/^[0-9A-Z]{26}$/);
    expect(id2).toMatch(/^[0-9A-Z]{26}$/);
    
    // Monotonic factory ensures id2 > id1 lexicographically
    expect(id2 > id1).toBe(true);
  });
});
