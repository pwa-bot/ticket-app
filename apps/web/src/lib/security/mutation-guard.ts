import { NextRequest, NextResponse } from "next/server";
import { assertCsrf } from "@/lib/security/csrf";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/security/rate-limit";

interface MutationGuardInput {
  request: NextRequest;
  bucket: string;
  identity: string;
  limit?: number;
  windowMs?: number;
}

export function applyMutationGuards({
  request,
  bucket,
  identity,
  limit = 30,
  windowMs = 60_000,
}: MutationGuardInput): NextResponse | null {
  const ip = getClientIp(request);
  const result = checkRateLimit({
    bucket,
    key: `${identity}:${ip}`,
    limit,
    windowMs,
  });

  if (!result.allowed) {
    return rateLimitResponse(result);
  }

  assertCsrf(request);
  return null;
}
