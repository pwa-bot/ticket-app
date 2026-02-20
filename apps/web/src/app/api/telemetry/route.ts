import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";

const WEB_EVENTS = new Set([
  "dashboard_activation_viewed",
  "dashboard_activation_repo_filtered",
  "dashboard_activation_jump_to_id",
  "dashboard_activation_open_ticket",
]);

interface TelemetryPayload {
  event: string;
  source?: string;
  properties?: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  const session = await requireSession();

  let payload: TelemetryPayload;
  try {
    payload = (await req.json()) as TelemetryPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!payload?.event || !WEB_EVENTS.has(payload.event)) {
    return NextResponse.json({ error: "Invalid telemetry event" }, { status: 400 });
  }

  // MVP sink: structured server logs. Replace with DB/warehouse sink in follow-up.
  console.info(
    JSON.stringify({
      channel: "telemetry",
      source: payload.source ?? "web",
      event: payload.event,
      userId: session.userId,
      properties: payload.properties ?? {},
      at: new Date().toISOString(),
    }),
  );

  return NextResponse.json({ ok: true });
}
