import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { hasTrustedOrigin, hasValidCsrfToken, isCsrfProtectionEnabled } from "@/lib/security/csrf";
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

  if (!hasTrustedOrigin(request)) {
    return apiError("Forbidden", { status: 403 });
  }

  if (isCsrfProtectionEnabled() && !hasValidCsrfToken(request)) {
    return apiError("Forbidden", { status: 403 });
  }

  return null;
}
