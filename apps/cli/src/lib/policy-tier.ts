import { promises as fs } from "node:fs";
import path from "node:path";
import { CONFIG_PATH } from "./constants.js";
import { ERROR_CODE, EXIT_CODE, TicketError } from "./errors.js";

export const POLICY_TIERS = ["hard", "integrity", "warn", "quality", "opt-in", "strict"] as const;
export type PolicyTier = (typeof POLICY_TIERS)[number];
export type PolicyEnforcement = "off" | "warn" | "fail";

export interface PolicyTierProfile {
  tier: PolicyTier;
  integrity: "fail";
  quality: PolicyEnforcement;
  strict: PolicyEnforcement;
}

const DEFAULT_POLICY_TIER: PolicyTier = "integrity";

const TIER_PROFILES: Record<PolicyTier, PolicyTierProfile> = {
  integrity: {
    tier: "integrity",
    integrity: "fail",
    quality: "off",
    strict: "off"
  },
  warn: {
    tier: "warn",
    integrity: "fail",
    quality: "warn",
    strict: "off"
  },
  quality: {
    tier: "quality",
    integrity: "fail",
    quality: "fail",
    strict: "off"
  },
  "opt-in": {
    tier: "opt-in",
    integrity: "fail",
    quality: "warn",
    strict: "warn"
  },
  strict: {
    tier: "strict",
    integrity: "fail",
    quality: "fail",
    strict: "fail"
  },
  hard: {
    tier: "hard",
    integrity: "fail",
    quality: "fail",
    strict: "fail"
  }
};

function isPolicyTier(value: string): value is PolicyTier {
  return (POLICY_TIERS as readonly string[]).includes(value);
}

function normalizePolicyTier(raw: string | undefined): PolicyTier | undefined {
  if (!raw) {
    return undefined;
  }
  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized === "opt_in") {
    return "opt-in";
  }
  return isPolicyTier(normalized) ? normalized : undefined;
}

function stripYamlStringQuotes(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\""))
      || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function parsePolicyTierFromConfig(rawConfig: string): string | undefined {
  const lines = rawConfig.split(/\r?\n/);
  let inPolicyBlock = false;
  let blockIndent = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    if (!inPolicyBlock) {
      const policyBlock = line.match(/^(\s*)policy:\s*$/);
      if (policyBlock) {
        inPolicyBlock = true;
        blockIndent = policyBlock[1].length;
        continue;
      }

      const inlineTopLevel = line.match(/^\s*policy_tier\s*:\s*(.*?)\s*$/);
      if (inlineTopLevel) {
        return stripYamlStringQuotes(inlineTopLevel[1]);
      }
      continue;
    }

    const currentIndent = (line.match(/^(\s*)/)?.[1].length ?? 0);
    if (currentIndent <= blockIndent) {
      inPolicyBlock = false;
      const inlineTopLevel = line.match(/^\s*policy_tier\s*:\s*(.*?)\s*$/);
      if (inlineTopLevel) {
        return stripYamlStringQuotes(inlineTopLevel[1]);
      }
      continue;
    }

    const keyValue = line.match(/^\s*tier\s*:\s*(.*?)\s*$/);
    if (keyValue) {
      return stripYamlStringQuotes(keyValue[1]);
    }
  }

  return undefined;
}

async function readPolicyTierFromConfig(cwd: string): Promise<string | undefined> {
  const configPath = path.join(cwd, CONFIG_PATH);
  try {
    const raw = await fs.readFile(configPath, "utf8");
    return parsePolicyTierFromConfig(raw);
  } catch {
    return undefined;
  }
}

function parseTierOrThrow(raw: string, source: "cli" | "env" | "config"): PolicyTier {
  const normalized = normalizePolicyTier(raw);
  if (normalized) {
    return normalized;
  }

  const allowed = POLICY_TIERS.join(", ");
  if (source === "cli") {
    throw new TicketError(
      ERROR_CODE.VALIDATION_FAILED,
      `Invalid --policy-tier value '${raw}'. Allowed: ${allowed}`,
      EXIT_CODE.USAGE,
      { source, raw, allowed: POLICY_TIERS }
    );
  }

  throw new TicketError(
    ERROR_CODE.VALIDATION_FAILED,
    `Invalid policy tier '${raw}' from ${source}. Allowed: ${allowed}`,
    EXIT_CODE.VALIDATION_FAILED,
    { source, raw, allowed: POLICY_TIERS }
  );
}

export function getPolicyTierProfile(tier: PolicyTier): PolicyTierProfile {
  return TIER_PROFILES[tier];
}

export interface ResolvePolicyTierOptions {
  cwd: string;
  cliTier?: string;
  env?: NodeJS.ProcessEnv;
}

export async function resolvePolicyTier(options: ResolvePolicyTierOptions): Promise<PolicyTierProfile> {
  const env = options.env ?? process.env;

  if (options.cliTier) {
    const tier = parseTierOrThrow(options.cliTier, "cli");
    return getPolicyTierProfile(tier);
  }

  if (env.TICKET_POLICY_TIER) {
    const tier = parseTierOrThrow(env.TICKET_POLICY_TIER, "env");
    return getPolicyTierProfile(tier);
  }

  const configTier = await readPolicyTierFromConfig(options.cwd);
  if (configTier) {
    const tier = parseTierOrThrow(configTier, "config");
    return getPolicyTierProfile(tier);
  }

  return getPolicyTierProfile(DEFAULT_POLICY_TIER);
}
