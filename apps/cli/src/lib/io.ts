import { readOrRecoverIndex, type TicketsIndex } from "./index.js";

export async function readIndex(cwd: string): Promise<TicketsIndex> {
  return readOrRecoverIndex(cwd);
}
