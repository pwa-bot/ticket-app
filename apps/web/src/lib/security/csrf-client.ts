"use client";

import { getApiErrorMessage } from "@/lib/api/client";

let csrfTokenCache: string | null = null;

function readCsrfToken(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const candidate = (payload as { csrfToken?: unknown }).csrfToken;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

export async function getCsrfToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && csrfTokenCache) {
    return csrfTokenCache;
  }

  const response = await fetch("/api/auth/csrf", {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "Failed to fetch CSRF token"));
  }

  const token = readCsrfToken(payload);
  if (!token) {
    throw new Error("Invalid CSRF token response");
  }

  csrfTokenCache = token;
  return token;
}

export async function csrfFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = await getCsrfToken();
  const headers = new Headers(init.headers);
  headers.set("x-csrf-token", token);

  let response = await fetch(input, {
    ...init,
    headers,
    credentials: "same-origin",
  });

  if (response.status !== 403) {
    return response;
  }

  const refreshedToken = await getCsrfToken(true);
  headers.set("x-csrf-token", refreshedToken);
  response = await fetch(input, {
    ...init,
    headers,
    credentials: "same-origin",
  });

  return response;
}
