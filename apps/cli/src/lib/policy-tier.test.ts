import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getPolicyTierProfile, resolvePolicyTier } from "./policy-tier.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

async function mkTempRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ticket-policy-tier-test-"));
  tempDirs.push(dir);
  await fs.mkdir(path.join(dir, ".tickets"), { recursive: true });
  return dir;
}

describe("policy tier profile matrix", () => {
  it("maps all tiers to expected enforcement", () => {
    expect(getPolicyTierProfile("integrity")).toMatchObject({ integrity: "fail", quality: "off", strict: "off" });
    expect(getPolicyTierProfile("warn")).toMatchObject({ integrity: "fail", quality: "warn", strict: "off" });
    expect(getPolicyTierProfile("quality")).toMatchObject({ integrity: "fail", quality: "fail", strict: "off" });
    expect(getPolicyTierProfile("opt-in")).toMatchObject({ integrity: "fail", quality: "warn", strict: "warn" });
    expect(getPolicyTierProfile("strict")).toMatchObject({ integrity: "fail", quality: "fail", strict: "fail" });
    expect(getPolicyTierProfile("hard")).toMatchObject({ integrity: "fail", quality: "fail", strict: "fail" });
  });
});

describe("resolvePolicyTier", () => {
  it("uses integrity as default tier", async () => {
    const cwd = await mkTempRepo();
    const resolved = await resolvePolicyTier({ cwd, env: {} });
    expect(resolved.tier).toBe("integrity");
  });

  it("reads policy.tier from config", async () => {
    const cwd = await mkTempRepo();
    await fs.writeFile(path.join(cwd, ".tickets/config.yml"), "policy:\n  tier: warn\n", "utf8");

    const resolved = await resolvePolicyTier({ cwd, env: {} });
    expect(resolved.tier).toBe("warn");
  });

  it("supports policy_tier top-level config key", async () => {
    const cwd = await mkTempRepo();
    await fs.writeFile(path.join(cwd, ".tickets/config.yml"), "policy_tier: quality\n", "utf8");

    const resolved = await resolvePolicyTier({ cwd, env: {} });
    expect(resolved.tier).toBe("quality");
  });

  it("prefers env over config", async () => {
    const cwd = await mkTempRepo();
    await fs.writeFile(path.join(cwd, ".tickets/config.yml"), "policy:\n  tier: integrity\n", "utf8");

    const resolved = await resolvePolicyTier({ cwd, env: { TICKET_POLICY_TIER: "strict" } });
    expect(resolved.tier).toBe("strict");
  });

  it("prefers CLI option over env/config", async () => {
    const cwd = await mkTempRepo();
    await fs.writeFile(path.join(cwd, ".tickets/config.yml"), "policy:\n  tier: integrity\n", "utf8");

    const resolved = await resolvePolicyTier({
      cwd,
      cliTier: "opt-in",
      env: { TICKET_POLICY_TIER: "strict" }
    });
    expect(resolved.tier).toBe("opt-in");
  });

  it("throws on invalid env tier", async () => {
    const cwd = await mkTempRepo();
    await expect(resolvePolicyTier({ cwd, env: { TICKET_POLICY_TIER: "banana" } }))
      .rejects
      .toThrow("Invalid policy tier 'banana' from env");
  });
});
