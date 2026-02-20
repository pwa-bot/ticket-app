import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/response";
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
  try {
    const session = await requireSession();

    let payload: TelemetryPayload;
    try {
      payload = (await req.json()) as TelemetryPayload;
    } catch {
      return apiError("Invalid JSON", { status: 400 });
    }

    if (!payload?.event || !WEB_EVENTS.has(payload.event)) {
      return apiError("Invalid telemetry event", { status: 400 });
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

    return apiSuccess({ tracked: true });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error("[/api/telemetry] Error:", error);
    return apiError("Telemetry failed", { status: 500 });
  }
}
