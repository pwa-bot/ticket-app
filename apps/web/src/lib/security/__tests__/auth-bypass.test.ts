import assert from "node:assert/strict";
import test from "node:test";
import { isDevAuthBypassEnabled } from "../auth-bypass";

test("auth bypass only enabled in development with explicit flag and user id", () => {
  assert.equal(
    isDevAuthBypassEnabled({ NODE_ENV: "development", DEV_BYPASS_AUTH: "true", DEV_BYPASS_USER_ID: "u_123" }),
    true,
  );

  assert.equal(
    isDevAuthBypassEnabled({ NODE_ENV: "production", DEV_BYPASS_AUTH: "true", DEV_BYPASS_USER_ID: "u_123" }),
    false,
  );

  assert.equal(
    isDevAuthBypassEnabled({ NODE_ENV: "development", DEV_BYPASS_AUTH: "true" }),
    false,
  );

  assert.equal(
    isDevAuthBypassEnabled({ NODE_ENV: "development", DEV_BYPASS_AUTH: "false", DEV_BYPASS_USER_ID: "u_123" }),
    false,
  );
});
