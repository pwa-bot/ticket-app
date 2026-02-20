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

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  return stdout.trim();
}

async function mkRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ticket-events-cli-test-"));
  tempDirs.push(dir);
  await git(dir, "init");
  return dir;
}

async function runCli(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  const cliEntrypoint = path.resolve(process.cwd(), "src/cli.ts");
  const tsxBin = path.resolve(process.cwd(), "node_modules/.bin/tsx");
  return execFileAsync(tsxBin, [cliEntrypoint, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      TICKET_TELEMETRY_BACKEND: "event_ref"
    }
  });
}

describe("events CLI", () => {
  it("writes an event and returns backend in json mode", async () => {
    const cwd = await mkRepo();

    const { stdout } = await runCli(cwd, [
      "events",
      "write",
      "agent_ping",
      "--id",
      "evt-smoke-1",
      "--ticket",
      "TK-01SMOKE1",
      "--prop",
      "actor=agent:codex",
      "--at",
      "2026-02-20T12:00:00.000Z",
      "--json"
    ]);

    const payload = JSON.parse(stdout.trim()) as {
      ok: boolean;
      data: { backend: string; event: { id: string; event: string; properties?: Record<string, unknown> } };
    };

    expect(payload.ok).toBe(true);
    expect(payload.data.backend).toBe("event_ref");
    expect(payload.data.event.id).toBe("evt-smoke-1");
    expect(payload.data.event.event).toBe("agent_ping");
    expect(payload.data.event.properties).toMatchObject({
      ticket_id: "TK-01SMOKE1",
      actor: "agent:codex"
    });
  });

  it("reads events and can render compact output", async () => {
    const cwd = await mkRepo();

    await runCli(cwd, [
      "events",
      "write",
      "agent_ping",
      "--id",
      "evt-smoke-2",
      "--ticket",
      "TK-01SMOKE2",
      "--at",
      "2026-02-20T12:01:00.000Z"
    ]);

    const jsonRead = await runCli(cwd, ["events", "read", "--limit", "200", "--json"]);
    const jsonPayload = JSON.parse(jsonRead.stdout.trim()) as {
      ok: boolean;
      data: { count: number; events: Array<{ id: string; event: string }> };
    };

    expect(jsonPayload.ok).toBe(true);
    expect(jsonPayload.data.count).toBeGreaterThan(0);
    expect(jsonPayload.data.events.some((entry) => entry.id === "evt-smoke-2" && entry.event === "agent_ping")).toBe(true);

    const compactRead = await runCli(cwd, ["events", "read", "--compact", "--limit", "200"]);
    expect(compactRead.stdout).toContain("evt-smoke-2");
    expect(compactRead.stdout).toContain("agent_ping");
    expect(compactRead.stdout).toContain("ticket=TK-01SMOKE2");
  });
});
