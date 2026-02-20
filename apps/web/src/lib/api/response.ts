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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function apiSuccess<T>(data: T, options: SuccessOptions = {}): NextResponse {
  const payload: ApiEnvelope<T> & Record<string, unknown> = { ok: true, data };

  if (options.legacyTopLevel !== false && isPlainObject(data)) {
    Object.assign(payload, data);
  }

  return NextResponse.json(payload, {
    status: options.status ?? 200,
    headers: options.headers,
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
    headers: options.headers,
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
