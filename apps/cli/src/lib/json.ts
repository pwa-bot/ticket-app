import { TicketError, type TicketErrorCode, ERROR_CODE } from "./errors.js";

export interface JsonSuccessEnvelope<T> {
  ok: true;
  data: T;
  warnings: string[];
}

export interface JsonFailureEnvelope {
  ok: false;
  error: {
    code: TicketErrorCode;
    message: string;
    details: Record<string, unknown>;
  };
  warnings: string[];
}

export type JsonEnvelope<T> = JsonSuccessEnvelope<T> | JsonFailureEnvelope;

export function successEnvelope<T>(data: T, warnings: string[] = []): JsonSuccessEnvelope<T> {
  return {
    ok: true,
    data,
    warnings
  };
}

export function failureEnvelope(error: unknown, warnings: string[] = []): JsonFailureEnvelope {
  if (error instanceof TicketError) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      },
      warnings
    };
  }

  return {
    ok: false,
    error: {
      code: ERROR_CODE.IO_ERROR,
      message: error instanceof Error ? error.message : String(error),
      details: {}
    },
    warnings
  };
}

export function writeEnvelope<T>(envelope: JsonEnvelope<T>): void {
  process.stdout.write(`${JSON.stringify(envelope)}\n`);
}
