import assert from "node:assert/strict";
import test from "node:test";
import { isAuthStatusCode, shouldShowReconnectCta } from "./auth-errors";

test("auth status helpers only treat 401/403 as reconnect-worthy", () => {
  assert.equal(isAuthStatusCode(401), true);
  assert.equal(isAuthStatusCode(403), true);
  assert.equal(isAuthStatusCode(500), false);
  assert.equal(isAuthStatusCode(undefined), false);

  assert.equal(shouldShowReconnectCta(401), true);
  assert.equal(shouldShowReconnectCta(403), true);
  assert.equal(shouldShowReconnectCta(429), false);
});
