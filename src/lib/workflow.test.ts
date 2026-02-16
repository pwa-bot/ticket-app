import { describe, expect, it } from "vitest";
import { assertTransition, canTransition, normalizeState } from "./workflow.js";

describe("workflow", () => {
  it("allows valid transitions", () => {
    expect(canTransition("ready", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "done")).toBe(true);
    expect(canTransition("backlog", "blocked")).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(() => assertTransition("backlog", "done")).toThrow("Invalid transition");
    expect(() => assertTransition("done", "ready")).toThrow("Invalid transition");
  });

  it("validates states", () => {
    expect(normalizeState("ready")).toBe("ready");
    expect(() => normalizeState("READY")).toThrow("Invalid state");
  });
});
