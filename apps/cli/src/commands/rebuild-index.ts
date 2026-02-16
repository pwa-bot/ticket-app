import { rebuildIndex } from "../lib/index.js";

export async function runRebuildIndex(cwd: string): Promise<void> {
  const index = await rebuildIndex(cwd);
  console.log(`Rebuilt index with ${index.tickets.length} tickets.`);
}
