import type { ApiEnvelope, ApiErrorCode } from "@ticketdotapp/core";
import { NextResponse } from "next/server";

type JsonInit = {
  status?: number;
  headers?: HeadersInit;
};

type SuccessOptions = JsonInit & {
  // Keep top-level legacy object fields for gradual migration.
  legacyTopLevel?: boolean;
};

type ErrorOptions = JsonInit & {
  code?: ApiErrorCode;
  details?: Record<string, unknown>;
  legacy?: Record<string, unknown>;
};

const JSON_SECURITY_HEADERS: Record<string, string> = {
  "cache-control": "private, no-store, no-cache, max-age=0, must-revalidate",
  pragma: "no-cache",
  expires: "0",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function withJsonSecurityHeaders(input?: HeadersInit): Headers {
  const headers = new Headers(input);

  for (const [name, value] of Object.entries(JSON_SECURITY_HEADERS)) {
    headers.set(name, value);
  }

  return headers;
}

export function apiSuccess<T>(data: T, options: SuccessOptions = {}): NextResponse {
  const payload: ApiEnvelope<T> & Record<string, unknown> = { ok: true, data };

  if (options.legacyTopLevel !== false && isPlainObject(data)) {
    Object.assign(payload, data);
  }

  return NextResponse.json(payload, {
    status: options.status ?? 200,
    headers: withJsonSecurityHeaders(options.headers),
  });
}

export function apiError(message: string, options: ErrorOptions = {}): NextResponse {
  const payload: ApiEnvelope<never> & Record<string, unknown> = {
    ok: false,
    error: {
      code: options.code ?? "unknown",
      message,
      ...(options.details ? { details: options.details } : {}),
    },
    errorCode: options.code ?? "unknown",
    errorMessage: message,
    ...(options.legacy ?? {}),
  };

  return NextResponse.json(payload, {
    status: options.status ?? 500,
    headers: withJsonSecurityHeaders(options.headers),
  });
}

export function readLegacyErrorMessage(value: unknown, fallback: string): string {
  if (isPlainObject(value)) {
    const error = value.error;
    if (typeof error === "string") {
      return error;
    }

    if (isPlainObject(error) && typeof error.message === "string") {
      return error.message;
    }

    if (typeof value.errorMessage === "string") {
      return value.errorMessage;
    }

    if (typeof value.message === "string") {
      return value.message;
    }
  }

  return fallback;
}
