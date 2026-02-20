import assert from "node:assert/strict";
import test from "node:test";
import { hasTrustedOrigin } from "../csrf";

test("hasTrustedOrigin accepts same-origin Origin header", () => {
  const request = new Request("https://app.ticket.test/api/auth/logout", {
    method: "POST",
    headers: { origin: "https://app.ticket.test" },
  });

  assert.equal(hasTrustedOrigin(request), true);
});

test("hasTrustedOrigin rejects cross-site Origin header", () => {
  const request = new Request("https://app.ticket.test/api/auth/logout", {
    method: "POST",
    headers: { origin: "https://evil.example" },
  });

  assert.equal(hasTrustedOrigin(request), false);
});

test("hasTrustedOrigin falls back to Referer when Origin is absent", () => {
  const request = new Request("https://app.ticket.test/api/auth/logout", {
    method: "POST",
    headers: { referer: "https://app.ticket.test/space" },
  });

  assert.equal(hasTrustedOrigin(request), true);
});

test("hasTrustedOrigin honors configured APP_URL when APP_URL_FORCE is true", () => {
  const request = new Request("https://internal-host/api/auth/logout", {
    method: "POST",
    headers: { origin: "https://app.ticket.test" },
  });

  assert.equal(
    hasTrustedOrigin(request, { APP_URL_FORCE: "true", APP_URL: "https://app.ticket.test" } as NodeJS.ProcessEnv),
    true,
  );
  assert.equal(
    hasTrustedOrigin(request, { APP_URL_FORCE: "true", APP_URL: "https://other.ticket.test" } as NodeJS.ProcessEnv),
    false,
  );
});
