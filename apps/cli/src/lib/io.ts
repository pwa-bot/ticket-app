import { promises as fs } from "node:fs";
import path from "node:path";
import { INDEX_PATH } from "./constants.js";
import { ERROR_CODE, EXIT_CODE, TicketError } from "./errors.js";
import { TicketsIndex } from "./index.js";

export async function readIndex(cwd: string): Promise<TicketsIndex> {
  const indexPath = path.join(cwd, INDEX_PATH);
  let raw: string;
  try {
    raw = await fs.readFile(indexPath, "utf8");
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : "";
    if (code === "ENOENT") {
      throw new TicketError(
        ERROR_CODE.NOT_INITIALIZED,
        "Ticket system not initialized. Run `ticket init`.",
        EXIT_CODE.NOT_INITIALIZED,
        { path: INDEX_PATH }
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new TicketError(ERROR_CODE.IO_ERROR, `Failed to read ${INDEX_PATH}: ${message}`, EXIT_CODE.UNEXPECTED);
  }

  try {
    return JSON.parse(raw) as TicketsIndex;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new TicketError(
      ERROR_CODE.INDEX_OUT_OF_SYNC,
      `Invalid ${INDEX_PATH}; run \`ticket rebuild-index\` (${message})`,
      EXIT_CODE.VALIDATION_FAILED
    );
  }
}
