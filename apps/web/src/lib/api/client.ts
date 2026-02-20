import type { ApiEnvelope } from "@ticketdotapp/core";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function unwrapApiData<T>(payload: unknown): T {
  if (isObject(payload) && payload.ok === true && "data" in payload) {
    return payload.data as T;
  }

  return payload as T;
}

export function getApiErrorMessage(payload: unknown, fallback: string): string {
  if (!isObject(payload)) {
    return fallback;
  }

  if (payload.ok === false) {
    const envelope = payload as ApiEnvelope<never> & Record<string, unknown>;
    if (isObject(envelope.error) && typeof envelope.error.message === "string") {
      return envelope.error.message;
    }
  }

  if (typeof payload.error === "string") {
    return payload.error;
  }

  if (typeof payload.errorMessage === "string") {
    return payload.errorMessage;
  }

  if (typeof payload.message === "string") {
    return payload.message;
  }

  return fallback;
}
