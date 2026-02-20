import assert from "node:assert/strict";
import test from "node:test";
import { auditSlackChannelConfigs, normalizeRepoFullName } from "./integrity-audit";

test("normalizeRepoFullName trims and lowercases values", () => {
  assert.equal(normalizeRepoFullName("  ACME/Repo-One  "), "acme/repo-one");
  assert.equal(normalizeRepoFullName(""), null);
  assert.equal(normalizeRepoFullName(null), null);
});

test("auditSlackChannelConfigs returns clean report when data is valid", () => {
  const report = auditSlackChannelConfigs({
    now: new Date("2026-02-20T10:00:00.000Z"),
    channels: [
      { scope: "portfolio", repoFullName: null, channelId: "C-portfolio" },
      { scope: "repo", repoFullName: "acme/api", channelId: "C-api" },
    ],
    accessibleRepoFullNames: ["acme/api", "acme/web"],
    enabledRepoFullNames: ["acme/api"],
  });

  assert.equal(report.generatedAt, "2026-02-20T10:00:00.000Z");
  assert.equal(report.summary.issueCount, 0);
  assert.equal(report.summary.errorCount, 0);
  assert.equal(report.summary.warnCount, 0);
  assert.deepEqual(report.summary.orphanRepoNames, []);
  assert.deepEqual(report.summary.disabledRepoNames, []);
});

test("auditSlackChannelConfigs detects orphan repo names and cross-scope violations", () => {
  const report = auditSlackChannelConfigs({
    channels: [
      { scope: "portfolio", repoFullName: "acme/api", channelId: "C1" },
      { scope: "portfolio", repoFullName: null, channelId: "C2" },
      { scope: "repo", repoFullName: null, channelId: "C3" },
      { scope: "repo", repoFullName: "acme", channelId: "C4" },
      { scope: "repo", repoFullName: "ghost/repo", channelId: "C5" },
      { scope: "repo", repoFullName: "ACME/API", channelId: "C6" },
      { scope: "repo", repoFullName: "acme/api", channelId: "C7" },
      { scope: "repo", repoFullName: "acme/web", channelId: "C8" },
      { scope: "unknown" as "repo", repoFullName: "acme/api", channelId: "C9" },
    ],
    accessibleRepoFullNames: ["acme/api", "acme/web"],
    enabledRepoFullNames: ["acme/api"],
  });

  const codes = report.issues.map((issue) => issue.code);
  assert.ok(codes.includes("portfolio_scope_has_repo_name"));
  assert.ok(codes.includes("duplicate_portfolio_scope"));
  assert.ok(codes.includes("repo_scope_missing_repo_name"));
  assert.ok(codes.includes("repo_scope_malformed_repo_name"));
  assert.ok(codes.includes("orphan_repo_name"));
  assert.ok(codes.includes("duplicate_repo_scope_target"));
  assert.ok(codes.includes("repo_scope_repo_not_enabled"));
  assert.ok(codes.includes("invalid_scope"));

  assert.equal(report.summary.errorCount, 7);
  assert.equal(report.summary.warnCount, 1);
  assert.deepEqual(report.summary.orphanRepoNames, ["ghost/repo"]);
  assert.deepEqual(report.summary.disabledRepoNames, ["acme/web"]);
});
