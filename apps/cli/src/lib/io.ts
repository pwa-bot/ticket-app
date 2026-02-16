import { promises as fs } from "node:fs";
import path from "node:path";
import { INDEX_PATH } from "./constants.js";
import { TicketsIndex } from "./index.js";

export async function readIndex(cwd: string): Promise<TicketsIndex> {
  const indexPath = path.join(cwd, INDEX_PATH);
  const raw = await fs.readFile(indexPath, "utf8");
  return JSON.parse(raw) as TicketsIndex;
}
