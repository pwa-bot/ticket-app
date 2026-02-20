import { describe, it, expect, expectTypeOf } from "vitest";
import {
  formatShortId,
  type Actor,
  type ActorRef,
  type Priority,
  type TicketPriority,
  type TicketState,
  type Ticket,
  type TicketConfig,
  type TicketFrontmatter,
  type TicketIndex,
  type TicketIndexEntry,
} from "../../src/index.js";

describe("shared ticket types", () => {
  it("keeps legacy aliases compatible with protocol types", () => {
    expectTypeOf<Actor>().toEqualTypeOf<ActorRef>();
    expectTypeOf<Priority>().toEqualTypeOf<TicketPriority>();
  });

  it("keeps index and frontmatter contracts consistent", () => {
    expectTypeOf<TicketFrontmatter["state"]>().toEqualTypeOf<TicketState>();
    expectTypeOf<TicketFrontmatter["priority"]>().toEqualTypeOf<TicketPriority>();
    expectTypeOf<Ticket["state"]>().toEqualTypeOf<TicketState>();
    expectTypeOf<TicketIndexEntry["priority"]>().toEqualTypeOf<TicketPriority>();

    const sampleIndex = {
      format_version: 1,
      generated_at: "2026-02-20T00:00:00.000Z",
      workflow: "simple-v1",
      tickets: [
        {
          id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
          short_id: "01ARZ3ND",
          display_id: "TK-01ARZ3ND",
          title: "Example",
          state: "ready",
          priority: "p1",
          labels: [],
          path: ".tickets/tickets/01ARZ3NDEKTSV4RRFFQ69G5FAV.md",
        },
      ],
    } satisfies TicketIndex;

    const sampleConfig = {
      version: 1,
      id_prefix: "TK",
      states: ["backlog", "ready", "in_progress", "blocked", "done"],
      priorities: ["p0", "p1", "p2", "p3"],
      labels: ["bug"],
    } satisfies TicketConfig;

    expect(sampleIndex.tickets).toHaveLength(1);
    expect(sampleConfig.id_prefix).toBe("TK");
  });

  it("formats short ticket IDs consistently", () => {
    expect(formatShortId("01ARZ3NDEKTSV4RRFFQ69G5FAV")).toBe("TK-01ARZ3ND");
    expect(formatShortId("01ARZ3NDEKTSV4RRFFQ69G5FAV", "BUG")).toBe("BUG-01ARZ3ND");
  });
});
