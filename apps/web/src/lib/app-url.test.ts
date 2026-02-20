import assert from "node:assert/strict";
import test from "node:test";
import { getCanonicalBaseUrl, getConfiguredAppOrigin, toCanonicalUrl } from "./app-url";

test("getConfiguredAppOrigin prefers APP_URL over NEXT_PUBLIC_APP_URL", () => {
  const env = {
    APP_URL: "https://app.ticket.test",
    NEXT_PUBLIC_APP_URL: "https://public.ticket.test",
  } as NodeJS.ProcessEnv;

  assert.equal(getConfiguredAppOrigin(env), "https://app.ticket.test");
});

test("getCanonicalBaseUrl falls back to request origin when no configured app url", () => {
  const request = new Request("http://127.0.0.1:3000/api/auth/github");
  assert.equal(getCanonicalBaseUrl(request, {} as NodeJS.ProcessEnv), "http://127.0.0.1:3000");
});

test("toCanonicalUrl prefers request origin by default to avoid host-mismatch auth loops", () => {
  const request = new Request("http://localhost:3000/api/auth/github");
  const url = toCanonicalUrl(request, "/space/settings", {
    APP_URL: "https://ticket.app",
  } as NodeJS.ProcessEnv);

  assert.equal(url.toString(), "http://localhost:3000/space/settings");
});

test("toCanonicalUrl can force configured APP_URL when APP_URL_FORCE=true", () => {
  const request = new Request("http://localhost:3000/api/auth/github");
  const url = toCanonicalUrl(request, "/space/settings", {
    APP_URL: "https://ticket.app",
    APP_URL_FORCE: "true",
  } as NodeJS.ProcessEnv);

  assert.equal(url.toString(), "https://ticket.app/space/settings");
});
