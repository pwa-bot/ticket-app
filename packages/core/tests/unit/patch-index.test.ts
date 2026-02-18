import { describe, it, expect } from "vitest";
import { patchIndexJson } from "../../src/patch-index.js";
import { TicketError } from "../../src/errors.js";

const BASE_INDEX = {
  format_version: 1,
  generated_at: "2026-02-16T00:00:00.000Z",
  workflow: "simple-v1",
  tickets: [
    {
      id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      short_id: "01ARZ3ND",
      display_id: "TK-01ARZ3ND",
      title: "Example ticket",
      state: "ready",
      priority: "p1",
      labels: ["bug"],
      path: ".tickets/tickets/01ARZ3NDEKTSV4RRFFQ69G5FAV.md",
    },
    {
      id: "01BRZ3NDEKTSV4RRFFQ69G5FAV",
      short_id: "01BRZ3ND",
      display_id: "TK-01BRZ3ND",
      title: "Second ticket",
      state: "backlog",
      priority: "p0",
      labels: [],
      path: ".tickets/tickets/01BRZ3NDEKTSV4RRFFQ69G5FAV.md",
    },
  ],
};

describe("patchIndexJson", () => {
  it("patches state and priority for a ticket entry", () => {
    const raw = JSON.stringify(BASE_INDEX, null, 2);
    const out = patchIndexJson({
      rawIndex: raw,
      ticketId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      patch: { state: "in_progress", priority: "p0" },
      now: new Date("2026-02-16T12:00:00.000Z"),
    });

    const idx = JSON.parse(out);
    const entry = idx.tickets.find((t: { id: string }) => t.id === "01ARZ3NDEKTSV4RRFFQ69G5FAV");
    expect(entry.state).toBe("in_progress");
    expect(entry.priority).toBe("p0");
    expect(idx.generated_at).toBe("2026-02-16T12:00:00.000Z");
  });

  it("re-sorts deterministically by state order then priority then id", () => {
    const raw = JSON.stringify(BASE_INDEX, null, 2);
    const out = patchIndexJson({
      rawIndex: raw,
      ticketId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      patch: { state: "backlog", priority: "p3" },
      now: new Date("2026-02-16T12:00:00.000Z"),
    });

    const idx = JSON.parse(out);
    // backlog tickets first. Within backlog, p0 then p3, then id.
    expect(idx.tickets[0].id).toBe("01BRZ3NDEKTSV4RRFFQ69G5FAV"); // backlog p0
    expect(idx.tickets[1].id).toBe("01ARZ3NDEKTSV4RRFFQ69G5FAV"); // backlog p3
  });

  it("patches labels with add/remove", () => {
    const raw = JSON.stringify(BASE_INDEX, null, 2);
    const out = patchIndexJson({
      rawIndex: raw,
      ticketId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      patch: { labels_add: ["urgent"], labels_remove: ["bug"] },
      now: new Date("2026-02-16T12:00:00.000Z"),
    });

    const idx = JSON.parse(out);
    const entry = idx.tickets.find((t: { id: string }) => t.id === "01ARZ3NDEKTSV4RRFFQ69G5FAV");
    expect(entry.labels).toEqual(["urgent"]);
  });

  it("labels_replace replaces labels", () => {
    const raw = JSON.stringify(BASE_INDEX, null, 2);
    const out = patchIndexJson({
      rawIndex: raw,
      ticketId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      patch: { labels_replace: ["foo", "bar", "foo"] },
      now: new Date("2026-02-16T12:00:00.000Z"),
    });

    const idx = JSON.parse(out);
    const entry = idx.tickets.find((t: { id: string }) => t.id === "01ARZ3NDEKTSV4RRFFQ69G5FAV");
    expect(entry.labels).toEqual(["foo", "bar"]);
  });

  it("clear_labels empties labels", () => {
    const raw = JSON.stringify(BASE_INDEX, null, 2);
    const out = patchIndexJson({
      rawIndex: raw,
      ticketId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      patch: { clear_labels: true },
      now: new Date("2026-02-16T12:00:00.000Z"),
    });

    const idx = JSON.parse(out);
    const entry = idx.tickets.find((t: { id: string }) => t.id === "01ARZ3NDEKTSV4RRFFQ69G5FAV");
    expect(entry.labels).toEqual([]);
  });

  it("sets and clears assignee/reviewer", () => {
    const raw = JSON.stringify(BASE_INDEX, null, 2);
    const out1 = patchIndexJson({
      rawIndex: raw,
      ticketId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      patch: { assignee: "agent:openclaw", reviewer: "human:morgan" },
      now: new Date("2026-02-16T12:00:00.000Z"),
    });

    const idx1 = JSON.parse(out1);
    const entry1 = idx1.tickets.find((t: { id: string }) => t.id === "01ARZ3NDEKTSV4RRFFQ69G5FAV");
    expect(entry1.assignee).toBe("agent:openclaw");
    expect(entry1.reviewer).toBe("human:morgan");

    const out2 = patchIndexJson({
      rawIndex: JSON.stringify(idx1, null, 2),
      ticketId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      patch: { assignee: null, reviewer: null },
      now: new Date("2026-02-16T12:00:00.000Z"),
    });

    const idx2 = JSON.parse(out2);
    const entry2 = idx2.tickets.find((t: { id: string }) => t.id === "01ARZ3NDEKTSV4RRFFQ69G5FAV");
    expect("assignee" in entry2).toBe(false);
    expect("reviewer" in entry2).toBe(false);
  });

  it("preserves unknown keys in entries", () => {
    const custom = structuredClone(BASE_INDEX);
    (custom.tickets[0] as Record<string, unknown>).extra_key = { a: 1 };
    const out = patchIndexJson({
      rawIndex: JSON.stringify(custom, null, 2),
      ticketId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      patch: { priority: "p2" },
      now: new Date("2026-02-16T12:00:00.000Z"),
    });

    const idx = JSON.parse(out);
    const entry = idx.tickets.find((t: { id: string }) => t.id === "01ARZ3NDEKTSV4RRFFQ69G5FAV");
    expect(entry.extra_key).toEqual({ a: 1 });
  });

  it("fails on invalid JSON", () => {
    expect(() =>
      patchIndexJson({
        rawIndex: "{not json",
        ticketId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        patch: { state: "ready" },
      })
    ).toThrowError(TicketError);

    try {
      patchIndexJson({
        rawIndex: "{not json",
        ticketId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        patch: { state: "ready" },
      });
    } catch (e: unknown) {
      expect((e as TicketError).code).toBe("index_invalid_format");
    }
  });

  it("fails when ticket entry is missing", () => {
    const raw = JSON.stringify(BASE_INDEX, null, 2);
    expect(() =>
      patchIndexJson({
        rawIndex: raw,
        ticketId: "01ZZZZZZZZZZZZZZZZZZZZZZZZ",
        patch: { state: "ready" },
      })
    ).toThrowError(TicketError);

    try {
      patchIndexJson({
        rawIndex: raw,
        ticketId: "01ZZZZZZZZZZZZZZZZZZZZZZZZ",
        patch: { state: "ready" },
      });
    } catch (e: unknown) {
      expect((e as TicketError).code).toBe("index_missing_ticket_entry");
    }
  });
});
