import assert from "node:assert/strict";
import test from "node:test";
import {
  createOAuthStateBinding,
  normalizeReturnTo,
  validateOAuthStateBinding,
} from "@/lib/auth-return-to";

test("normalizeReturnTo only allows allowlisted in-app paths", () => {
  assert.equal(normalizeReturnTo("/space"), "/space");
  assert.equal(normalizeReturnTo("/space/settings"), "/space/settings");
  assert.equal(normalizeReturnTo("/space/acme/repo?tab=attention"), "/space/acme/repo?tab=attention");
  assert.equal(normalizeReturnTo("/board"), "/board");
  assert.equal(normalizeReturnTo("/repos"), "/repos");

  assert.equal(normalizeReturnTo("https://evil.example/steal"), "/space");
  assert.equal(normalizeReturnTo("//evil.example/steal"), "/space");
  assert.equal(normalizeReturnTo("/api/auth/github"), "/space");
  assert.equal(normalizeReturnTo("/"), "/space");
});

test("validateOAuthStateBinding accepts valid signed binding", () => {
  const env = { NEXTAUTH_SECRET: "test-secret" } as NodeJS.ProcessEnv;
  const state = "0123456789abcdef0123456789abcdef";
  const returnTo = "/space/settings";
  const binding = createOAuthStateBinding(state, returnTo, env);

  assert.equal(
    validateOAuthStateBinding({
      providedState: state,
      stateBindingCookie: binding,
      returnTo,
      env,
    }),
    true,
  );
});

test("validateOAuthStateBinding rejects tampered state/returnTo/malformed values", () => {
  const env = { NEXTAUTH_SECRET: "test-secret" } as NodeJS.ProcessEnv;
  const state = "0123456789abcdef0123456789abcdef";
  const returnTo = "/space/settings";
  const binding = createOAuthStateBinding(state, returnTo, env);

  assert.equal(
    validateOAuthStateBinding({
      providedState: "fedcba9876543210fedcba9876543210",
      stateBindingCookie: binding,
      returnTo,
      env,
    }),
    false,
  );

  assert.equal(
    validateOAuthStateBinding({
      providedState: state,
      stateBindingCookie: binding,
      returnTo: "/space/onboarding",
      env,
    }),
    false,
  );

  assert.equal(
    validateOAuthStateBinding({
      providedState: state,
      stateBindingCookie: "not-a-valid-binding",
      returnTo,
      env,
    }),
    false,
  );
});
