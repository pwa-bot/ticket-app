import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { readIndex } from "../lib/io.js";
import { successEnvelope, writeEnvelope } from "../lib/json.js";
import { resolveTicket } from "../lib/resolve.js";

export interface ShowCommandOptions {
  ci?: boolean;
  json?: boolean;
}

export async function runShow(cwd: string, id: string, options: ShowCommandOptions): Promise<void> {
  const index = await readIndex(cwd);
  const ticket = resolveTicket(index, id, options.ci ?? false);
  const markdown = await fs.readFile(path.join(cwd, ticket.path), "utf8");

  if (options.json) {
    const parsed = matter(markdown);
    const data = {
      ...ticket,
      ...parsed.data,
      body_md: parsed.content
    };
    writeEnvelope(successEnvelope(data));
    return;
  }

  process.stdout.write(markdown.endsWith("\n") ? markdown : `${markdown}\n`);
}
