interface TelemetryEnvelope {
  event: string;
  source?: "web";
  properties?: Record<string, unknown>;
}

export function trackWebEvent(event: string, properties?: Record<string, unknown>): void {
  const payload: TelemetryEnvelope = {
    event,
    source: "web",
    properties,
  };

  void fetch("/api/telemetry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // Never break UX for telemetry failures.
  });
}
