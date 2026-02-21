import type {
  GithubWebhookSecurityEvent,
  GithubWebhookSecurityEventType,
  GithubWebhookSecurityMonitor,
} from "@/lib/services/github-webhook-service";

type SecurityMetricsByType = {
  [K in GithubWebhookSecurityEventType]: number;
};

export interface WebhookSecurityMetricsSnapshot {
  total: number;
  byType: SecurityMetricsByType;
  byEvent: Record<string, number>;
  lastSeenAt: string | null;
}

const SECURITY_TYPES: GithubWebhookSecurityEventType[] = [
  "secret_not_configured",
  "signature_missing",
  "signature_malformed",
  "signature_invalid",
  "signature_verified",
  "delivery_id_missing",
  "replay_delivery",
  "replay_idempotency",
  "payload_invalid_json",
];

function createEmptyByType(): SecurityMetricsByType {
  return {
    secret_not_configured: 0,
    signature_missing: 0,
    signature_malformed: 0,
    signature_invalid: 0,
    signature_verified: 0,
    delivery_id_missing: 0,
    replay_delivery: 0,
    replay_idempotency: 0,
    payload_invalid_json: 0,
  };
}

const state: { total: number; byType: SecurityMetricsByType; byEvent: Record<string, number>; lastSeenAt: string | null } = {
  total: 0,
  byType: createEmptyByType(),
  byEvent: {},
  lastSeenAt: null,
};

function logWebhookSecurityEvent(event: GithubWebhookSecurityEvent): void {
  const level = event.type === "signature_verified" ? "info" : "warn";
  const payload = JSON.stringify({
    channel: "webhook_security",
    at: new Date().toISOString(),
    type: event.type,
    event: event.event,
    deliveryId: event.deliveryId ?? null,
    repoFullName: event.repoFullName ?? null,
  });

  if (level === "warn") {
    console.warn(payload);
    return;
  }
  console.info(payload);
}

export const webhookSecurityMonitor: GithubWebhookSecurityMonitor = {
  record(event) {
    state.total += 1;
    state.byType[event.type] += 1;
    state.byEvent[event.event] = (state.byEvent[event.event] ?? 0) + 1;
    state.lastSeenAt = new Date().toISOString();
    logWebhookSecurityEvent(event);
  },
};

export function getWebhookSecurityMetricsSnapshot(): WebhookSecurityMetricsSnapshot {
  const byType = createEmptyByType();
  for (const type of SECURITY_TYPES) {
    byType[type] = state.byType[type];
  }
  return {
    total: state.total,
    byType,
    byEvent: { ...state.byEvent },
    lastSeenAt: state.lastSeenAt,
  };
}
