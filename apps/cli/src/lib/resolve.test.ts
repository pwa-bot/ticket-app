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
    },
    {
      id: "01KHWGYA000000000000000000",
      short_id: "01KHWGYA",
      display_id: "TK-01KHWGYA",
      title: "Collision first",
      state: "ready",
      priority: "p2",
      labels: [],
      path: ".tickets/tickets/01KHWGYA000000000000000000.md"
    },
    {
      id: "01KHWGYA000000000000000001",
      short_id: "01KHWGYA",
      display_id: "TK-01KHWGYA-2",
      title: "Collision second",
      state: "ready",
      priority: "p2",
      labels: [],
      path: ".tickets/tickets/01KHWGYA000000000000000001.md"
    },
    {
      id: "01KHWGYA000000000000000002",
      short_id: "01KHWGYA",
      display_id: "TK-01KHWGYA-3",
      title: "Collision third",
      state: "ready",
      priority: "p2",
      labels: [],
      path: ".tickets/tickets/01KHWGYA000000000000000002.md"
    }
  ]
};

describe("resolveTicket", () => {
  it("resolves exact ids in ci mode", () => {
    const ticket = resolveTicket(index, "01ARZ3NDEKTSV4RRFFQ69G5FAV", true);
    expect(ticket.display_id).toBe("TK-01ARZ3ND");
  });

  it("resolves exact display_id before short_id", () => {
    const ticket = resolveTicket(index, "TK-01ARZ3ND", false);
    expect(ticket.id).toBe("01ARZ3NDEKTSV4RRFFQ69G5FAV");
  });

  it("resolves unique short_id", () => {
    const ticket = resolveTicket(index, "01ARZ3P9", false);
    expect(ticket.id).toBe("01ARZ3P9E4C1N2EXAMPLEABCDE");
  });

  it("resolves suffixed display ids for collision groups", () => {
    const ticket = resolveTicket(index, "TK-01KHWGYA-3", false);
    expect(ticket.id).toBe("01KHWGYA000000000000000002");
  });

  it("retains compatibility for unsuffixed display id and errors on ambiguous short_id", () => {
    const legacy = resolveTicket(index, "TK-01KHWGYA", false);
    expect(legacy.id).toBe("01KHWGYA000000000000000000");
    expect(() => resolveTicket(index, "01KHWGYA", false)).toThrow("Ambiguous ticket id '01KHWGYA'");
  });

  it("rejects fuzzy prefix and title matches", () => {
    expect(() => resolveTicket(index, "01ARZ3", false)).toThrow("Ticket not found");
    expect(() => resolveTicket(index, "paywall", false)).toThrow("Ticket not found");
  });
});
