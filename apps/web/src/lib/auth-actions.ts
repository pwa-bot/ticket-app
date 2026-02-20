"use client";

import { getApiErrorMessage } from "@/lib/api/client";
import { csrfFetch } from "@/lib/security/csrf-client";

interface AuthActionPayload {
  redirectTo?: string;
}

function readRedirectTo(payload: unknown, fallback: string): string {
  if (typeof payload === "object" && payload !== null) {
    const direct = (payload as AuthActionPayload).redirectTo;
    if (typeof direct === "string" && direct.length > 0) {
      return direct;
    }

    const data = (payload as { data?: AuthActionPayload }).data;
    if (data && typeof data.redirectTo === "string" && data.redirectTo.length > 0) {
      return data.redirectTo;
    }
  }

  return fallback;
}

export async function logoutWithPost(): Promise<void> {
  const response = await csrfFetch("/api/auth/logout", { method: "POST" });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "Failed to log out"));
  }

  window.location.assign(readRedirectTo(payload, "/"));
}

export async function reconnectWithPost(returnTo: string): Promise<void> {
  const response = await csrfFetch("/api/auth/reconnect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ returnTo }),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "Failed to reconnect GitHub"));
  }

  window.location.assign(readRedirectTo(payload, "/api/auth/github"));
}
