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

function extractTicketErrorWarnings(error: TicketError): string[] {
  const warnings = (error.details as { warnings?: unknown } | undefined)?.warnings;
  if (!Array.isArray(warnings)) {
    return [];
  }
  return warnings.filter((warning): warning is string => typeof warning === "string" && warning.length > 0);
}

export function successEnvelope<T>(data: T, warnings: string[] = []): JsonSuccessEnvelope<T> {
  return {
    ok: true,
    data,
    warnings
  };
}

export function failureEnvelope(error: unknown, warnings: string[] = []): JsonFailureEnvelope {
  if (error instanceof TicketError) {
    const detailWarnings = extractTicketErrorWarnings(error);
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      },
      warnings: [...detailWarnings, ...warnings]
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
