import { NextRequest, NextResponse } from "next/server";

interface BucketState {
  count: number;
  resetAt: number;
}

interface RateLimitInput {
  bucket: string;
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

const store = new Map<string, BucketState>();

export function checkRateLimit(input: RateLimitInput): RateLimitResult {
  const now = input.now ?? Date.now();
  const compositeKey = `${input.bucket}:${input.key}`;
  const existing = store.get(compositeKey);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + input.windowMs;
    store.set(compositeKey, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: Math.max(0, input.limit - 1),
      resetAt,
      retryAfterSeconds: Math.ceil(input.windowMs / 1000),
    };
  }

  if (existing.count >= input.limit) {
    const retryAfterMs = Math.max(0, existing.resetAt - now);
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    };
  }

  existing.count += 1;
  store.set(compositeKey, existing);

  return {
    allowed: true,
    remaining: Math.max(0, input.limit - existing.count),
    resetAt: existing.resetAt,
    retryAfterSeconds: Math.ceil(Math.max(0, existing.resetAt - now) / 1000),
  };
}

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }

  return request.headers.get("x-real-ip") ?? "unknown";
}

export function rateLimitResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(Math.floor(result.resetAt / 1000)),
      },
    },
  );
}

export function pruneRateLimitStore(now = Date.now()) {
  for (const [key, value] of store.entries()) {
    if (value.resetAt <= now) {
      store.delete(key);
    }
  }
}
