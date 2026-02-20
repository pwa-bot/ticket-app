import assert from "node:assert/strict";
import test from "node:test";
import { apiError, apiSuccess, readLegacyErrorMessage } from "./response";

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

test("readLegacyErrorMessage handles string and envelope errors", () => {
  assert.equal(readLegacyErrorMessage({ error: "plain-error" }, "fallback"), "plain-error");
  assert.equal(
    readLegacyErrorMessage({ error: { code: "unknown", message: "structured-error" } }, "fallback"),
    "structured-error",
  );
  assert.equal(readLegacyErrorMessage({ errorMessage: "fallback-field" }, "fallback"), "fallback-field");
  assert.equal(readLegacyErrorMessage({}, "fallback"), "fallback");
});
