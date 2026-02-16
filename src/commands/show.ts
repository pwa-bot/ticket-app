import { promises as fs } from "node:fs";
import path from "node:path";
import { readIndex } from "../lib/io.js";
import { resolveTicket } from "../lib/resolve.js";

export interface ShowCommandOptions {
  ci?: boolean;
}

export async function runShow(cwd: string, id: string, options: ShowCommandOptions): Promise<void> {
  const index = await readIndex(cwd);
  const ticket = resolveTicket(index, id, options.ci ?? false);
  const markdown = await fs.readFile(path.join(cwd, ticket.path), "utf8");
  process.stdout.write(markdown.endsWith("\n") ? markdown : `${markdown}\n`);
}
