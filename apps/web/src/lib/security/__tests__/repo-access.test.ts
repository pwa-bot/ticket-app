import assert from "node:assert/strict";
import test from "node:test";
import { assertNoUnauthorizedRepos, findUnauthorizedRepos } from "../repo-access";

test("findUnauthorizedRepos returns requested repos missing from accessible set", () => {
  const unauthorized = findUnauthorizedRepos(
    new Set(["acme/one", "acme/two", "acme/three"]),
    ["acme/one", "acme/three"],
  );

  assert.deepEqual(unauthorized, ["acme/two"]);
});

test("assertNoUnauthorizedRepos throws 403 response with unauthorized repo details", async () => {
  try {
    assertNoUnauthorizedRepos(new Set(["acme/one", "acme/two"]), ["acme/one"]);
    assert.fail("expected assertNoUnauthorizedRepos to throw");
  } catch (error) {
    assert.ok(error instanceof Response);
    assert.equal(error.status, 403);

    const payload = (await error.json()) as { repos?: string[] };
    assert.deepEqual(payload.repos, ["acme/two"]);
  }
});
