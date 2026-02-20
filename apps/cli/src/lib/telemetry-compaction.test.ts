import { describe, expect, it } from "vitest";
import { buildTelemetryCompactionPlan, extractTelemetryTicketId, toCompactionGroupKey } from "./telemetry-compaction.js";
import type { CliTelemetryPayload } from "./telemetry.js";

function event(payload: Partial<CliTelemetryPayload>): CliTelemetryPayload {
  return {
    id: payload.id ?? "evt-1",
    event: payload.event ?? "ticket_updated",
    source: "cli",
    at: payload.at ?? "2026-02-20T12:00:00.000Z",
    properties: payload.properties
  };
}

describe("telemetry compaction plan", () => {
  it("extracts ticket ids from common property keys", () => {
    expect(extractTelemetryTicketId(event({ properties: { ticket_id: "tk-ab12" } }))).toBe("TK-AB12");
    expect(extractTelemetryTicketId(event({ properties: { ticketId: "01ARZ3NDEKTSV4RRFFQ69G5FAV" } }))).toBe("01ARZ3NDEKTSV4RRFFQ69G5FAV");
    expect(extractTelemetryTicketId(event({ properties: { id: "not-a-ticket" } }))).toBeNull();
  });

  it("groups ticket-scoped events under ticket key and others by event name", () => {
    expect(toCompactionGroupKey(event({ properties: { display_id: "TK-XYZ1" } }))).toEqual({
      key: "ticket:TK-XYZ1",
      ticketId: "TK-XYZ1"
    });
    expect(toCompactionGroupKey(event({ event: "cli_activation_command_started" }))).toEqual({
      key: "event:cli_activation_command_started",
      ticketId: null
    });
  });

  it("builds deterministic snapshots with reduction counts", () => {
    const plan = buildTelemetryCompactionPlan([
      event({
        id: "evt-2",
        at: "2026-02-20T12:02:00.000Z",
        event: "ticket_moved",
        properties: { ticket_id: "TK-AAA1" }
      }),
      event({
        id: "evt-1",
        at: "2026-02-20T12:01:00.000Z",
        event: "ticket_viewed",
        properties: { ticket_id: "TK-AAA1" }
      }),
      event({
        id: "evt-3",
        at: "2026-02-20T12:03:00.000Z",
        event: "cli_activation_command_started"
      })
    ]);

    expect(plan.sourceEventCount).toBe(3);
    expect(plan.snapshotCount).toBe(2);
    expect(plan.reductionCount).toBe(1);
    expect(plan.snapshots.map((entry) => entry.id)).toEqual(["snap-0001", "snap-0002"]);
    expect(plan.snapshots[1].properties).toMatchObject({
      key: "ticket:TK-AAA1",
      total_events: 2,
      event_counts: {
        ticket_viewed: 1,
        ticket_moved: 1
      }
    });
  });
});
