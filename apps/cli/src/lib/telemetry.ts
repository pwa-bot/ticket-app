interface CliTelemetryPayload {
  event: string;
  source: "cli";
  properties?: Record<string, unknown>;
  at: string;
}

const DEFAULT_TIMEOUT_MS = 700;

export async function emitCliTelemetry(event: string, properties?: Record<string, unknown>): Promise<void> {
  const telemetryUrl = process.env.TICKET_APP_TELEMETRY_URL;
  if (!telemetryUrl) {
    return;
  }

  const payload: CliTelemetryPayload = {
    event,
    source: "cli",
    properties,
    at: new Date().toISOString(),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    await fetch(telemetryUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch {
    // CLI must remain offline-safe and never fail due to telemetry.
  } finally {
    clearTimeout(timeout);
  }
}
