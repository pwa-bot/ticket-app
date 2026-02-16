import { describe, expect, it } from "vitest";
import type { TicketsIndex } from "./index.js";
import { resolveTicket } from "./resolve.js";

const index: TicketsIndex = {
  format_version: 1,
  generated_at: "2026-02-16T00:00:00.000Z",
  workflow: "simple-v1",
  tickets: [
    {
      id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      short_id: "01ARZ3ND",
      display_id: "TK-01ARZ3ND",
      title: "Add paywall experiment",
      state: "ready",
      priority: "p1",
      labels: ["growth"],
      path: ".tickets/tickets/01ARZ3NDEKTSV4RRFFQ69G5FAV.md"
    },
    {
      id: "01ARZ3P9E4C1N2EXAMPLEABCDE",
      short_id: "01ARZ3P9",
      display_id: "TK-01ARZ3P9",
      title: "Refactor onboarding",
      state: "backlog",
      priority: "p2",
      labels: ["onboarding"],
      path: ".tickets/tickets/01ARZ3P9E4C1N2EXAMPLEABCDE.md"
    }
  ]
};

describe("resolveTicket", () => {
  it("resolves exact ids in ci mode", () => {
    const ticket = resolveTicket(index, "01ARZ3NDEKTSV4RRFFQ69G5FAV", true);
    expect(ticket.display_id).toBe("TK-01ARZ3ND");
  });

  it("rejects fuzzy ids in ci mode", () => {
    expect(() => resolveTicket(index, "01ARZ3", true)).toThrow("Ticket not found");
  });

  it("supports fuzzy prefix in interactive mode", () => {
    const ticket = resolveTicket(index, "01ARZ3NDEK", false);
    expect(ticket.display_id).toBe("TK-01ARZ3ND");
  });

  it("supports title matching in interactive mode", () => {
    const ticket = resolveTicket(index, "paywall", false);
    expect(ticket.id).toBe("01ARZ3NDEKTSV4RRFFQ69G5FAV");
  });
});
