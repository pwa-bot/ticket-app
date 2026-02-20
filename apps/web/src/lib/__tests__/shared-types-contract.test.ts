import assert from "node:assert/strict";
import test from "node:test";
import {
  type TicketIndex,
  type TicketState,
  type TicketPriority,
  type Actor,
} from "@ticketdotapp/core";

test("web consumes canonical ticket domain types from @ticketdotapp/core", () => {
  const sampleState: TicketState = "ready";
  const samplePriority: TicketPriority = "p1";
  const sampleActor: Actor = "human:morgan";

  const index: TicketIndex = {
    format_version: 1,
    generated_at: "2026-02-20T00:00:00.000Z",
    workflow: "simple-v1",
    tickets: [
      {
        id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        short_id: "01ARZ3ND",
        display_id: "TK-01ARZ3ND",
        title: "Shared type contract",
        state: sampleState,
        priority: samplePriority,
        labels: ["refactor"],
        path: ".tickets/tickets/01ARZ3NDEKTSV4RRFFQ69G5FAV.md",
        assignee: sampleActor,
      },
    ],
  };

  assert.equal(index.tickets[0]?.display_id, "TK-01ARZ3ND");
});
