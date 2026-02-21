import assert from "node:assert/strict";
import test from "node:test";
import { apiError, apiSuccess, readLegacyErrorMessage } from "./response";

const EXPECTED_CACHE_CONTROL = "private, no-store, no-cache, max-age=0, must-revalidate";

test("apiSuccess wraps data and keeps top-level object fields by default", async () => {
  const response = apiSuccess({ repos: [{ full_name: "acme/repo" }] });
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.deepEqual(body.data, { repos: [{ full_name: "acme/repo" }] });
  assert.deepEqual(body.repos, [{ full_name: "acme/repo" }]);
});

test("apiSuccess can disable legacy top-level merge", async () => {
  const response = apiSuccess({ repos: [] }, { legacyTopLevel: false });
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(body.ok, true);
  assert.deepEqual(body.data, { repos: [] });
  assert.equal("repos" in body, false);
});

test("apiError emits standardized error envelope", async () => {
  const response = apiError("Forbidden", { status: 403, code: "unknown", legacy: { repos: ["acme/private"] } });
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 403);
  assert.equal(body.ok, false);
  assert.equal((body.error as { message: string }).message, "Forbidden");
  assert.equal(body.errorCode, "unknown");
  assert.equal(body.errorMessage, "Forbidden");
  assert.deepEqual(body.repos, ["acme/private"]);
});

test("apiSuccess applies strict cache and security headers for JSON", () => {
  const response = apiSuccess({ repos: [] });

  assert.equal(response.headers.get("cache-control"), EXPECTED_CACHE_CONTROL);
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("expires"), "0");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
});

test("apiError enforces strict cache-control even when caller tries to override it", () => {
  const response = apiError("Forbidden", {
    status: 403,
    headers: {
      "cache-control": "public, max-age=3600",
      "x-extra-header": "audit",
    },
  });

  assert.equal(response.headers.get("cache-control"), EXPECTED_CACHE_CONTROL);
  assert.equal(response.headers.get("x-extra-header"), "audit");
});

test("readLegacyErrorMessage handles string and envelope errors", () => {
  assert.equal(readLegacyErrorMessage({ error: "plain-error" }, "fallback"), "plain-error");
  assert.equal(
    readLegacyErrorMessage({ error: { code: "unknown", message: "structured-error" } }, "fallback"),
    "structured-error",
  );
  assert.equal(readLegacyErrorMessage({ errorMessage: "fallback-field" }, "fallback"), "fallback-field");
  assert.equal(readLegacyErrorMessage({}, "fallback"), "fallback");
});
