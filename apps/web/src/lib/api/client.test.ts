import assert from "node:assert/strict";
import test from "node:test";
import { getApiErrorMessage, unwrapApiData } from "./client";

test("unwrapApiData returns envelope data", () => {
  const data = unwrapApiData<{ repos: string[] }>({ ok: true, data: { repos: ["acme/repo"] } });
  assert.deepEqual(data, { repos: ["acme/repo"] });
});

test("unwrapApiData returns raw payload for backward compatibility", () => {
  const data = unwrapApiData<{ repos: string[] }>({ repos: ["acme/repo"] });
  assert.deepEqual(data, { repos: ["acme/repo"] });
});

test("getApiErrorMessage handles envelope and legacy formats", () => {
  assert.equal(
    getApiErrorMessage({ ok: false, error: { code: "unknown", message: "structured" } }, "fallback"),
    "structured",
  );
  assert.equal(getApiErrorMessage({ error: "legacy" }, "fallback"), "legacy");
  assert.equal(getApiErrorMessage({ errorMessage: "legacy-field" }, "fallback"), "legacy-field");
  assert.equal(getApiErrorMessage({}, "fallback"), "fallback");
});
