import assert from "node:assert/strict";
import test from "node:test";
import { findUnauthorizedRepos } from "../repo-access";

test("findUnauthorizedRepos returns requested repos missing from accessible set", () => {
  const unauthorized = findUnauthorizedRepos(
    new Set(["acme/one", "acme/two", "acme/three"]),
    ["acme/one", "acme/three"],
  );

  assert.deepEqual(unauthorized, ["acme/two"]);
});
