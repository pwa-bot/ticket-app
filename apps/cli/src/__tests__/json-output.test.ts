import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runList } from "../commands/list.js";
import { runShow } from "../commands/show.js";
import { runValidate } from "../commands/validate.js";
import { rebuildIndex } from "../lib/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

async function mkTempRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ticket-json-test-"));
  tempDirs.push(dir);
  await fs.mkdir(path.join(dir, ".tickets/tickets"), { recursive: true });
  return dir;
}

async function writeTicket(cwd: string, id: string, title: string): Promise<void> {
  const file = path.join(cwd, ".tickets/tickets", `${id}.md`);
  const contents = `---
id: ${id}
title: ${JSON.stringify(title)}
state: ready
priority: p1
labels: [bug]
created: 2026-02-16T00:00:00.000Z
updated: 2026-02-16T00:00:00.000Z
---
Ticket body
`;
  await fs.writeFile(file, contents, "utf8");
}

function captureStdout(): { output: string[] } {
  const output: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
    output.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
    return true;
  }) as typeof process.stdout.write);
  return { output };
}

describe("json output mode", () => {
  it("prints a JSON envelope for list", async () => {
    const cwd = await mkTempRepo();
    await writeTicket(cwd, "01ARZ3NDEKTSV4RRFFQ69G5FAV", "One");
    await rebuildIndex(cwd);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { output } = captureStdout();

    await runList(cwd, { json: true });

    expect(logSpy).not.toHaveBeenCalled();
    const payload = JSON.parse(output.join("").trim()) as { ok: boolean; data: { tickets: unknown[]; count: number }; warnings: unknown[] };
    expect(payload.ok).toBe(true);
    expect(payload.data.count).toBe(1);
    expect(payload.data.tickets).toHaveLength(1);
    expect(payload.warnings).toEqual([]);
  });

  it("prints a JSON envelope for show with body_md", async () => {
    const cwd = await mkTempRepo();
    const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
    await writeTicket(cwd, id, "One");
    await rebuildIndex(cwd);

    const { output } = captureStdout();
    await runShow(cwd, "01ARZ3ND", { json: true });

    const payload = JSON.parse(output.join("").trim()) as { ok: boolean; data: { id: string; body_md: string }; warnings: unknown[] };
    expect(payload.ok).toBe(true);
    expect(payload.data.id).toBe(id);
    expect(payload.data.body_md.trim()).toBe("Ticket body");
    expect(payload.warnings).toEqual([]);
  });

  it("prints a JSON envelope for validate and avoids console.log", async () => {
    const cwd = await mkTempRepo();
    await writeTicket(cwd, "01ARZ3NDEKTSV4RRFFQ69G5FAV", "One");
    await rebuildIndex(cwd);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { output } = captureStdout();

    await runValidate(cwd, { json: true });

    expect(logSpy).not.toHaveBeenCalled();
    const payload = JSON.parse(output.join("").trim()) as {
      ok: boolean;
      data: { valid: boolean; fix_requested: boolean; fixes_applied: boolean };
      warnings: unknown[];
    };
    expect(payload.ok).toBe(true);
    expect(payload.data.valid).toBe(true);
    expect(payload.data.fix_requested).toBe(false);
    expect(payload.data.fixes_applied).toBe(false);
    expect(payload.warnings).toEqual([]);
  });
});
