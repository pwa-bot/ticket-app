import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

async function mkTempRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ticket-cli-json-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("cli json error envelope", () => {
  it("emits one JSON object on stdout for TicketError failures", async () => {
    const cwd = await mkTempRepo();
    const cliEntrypoint = path.resolve(process.cwd(), "src/cli.ts");
    const tsxBin = path.resolve(process.cwd(), "node_modules/.bin/tsx");

    try {
      await execFileAsync(tsxBin, [cliEntrypoint, "list", "--json"], { cwd });
      throw new Error("Expected command to fail");
    } catch (error) {
      const failed = error as { code?: number; stdout?: string; stderr?: string };
      expect(failed.code).toBe(3);
      expect((failed.stderr ?? "").trim()).toBe("");

      const lines = (failed.stdout ?? "").trim().split("\n").filter(Boolean);
      expect(lines).toHaveLength(1);
      const payload = JSON.parse(lines[0]) as {
        ok: boolean;
        error: { code: string; message: string; details: Record<string, unknown> };
        warnings: unknown[];
      };

      expect(payload.ok).toBe(false);
      expect(payload.error.code).toBe("not_initialized");
      expect(payload.error.message).toContain("Ticket system not initialized");
      expect(payload.error.details).toEqual({ path: ".tickets/index.json" });
      expect(payload.warnings).toEqual([]);
    }
  });
});
