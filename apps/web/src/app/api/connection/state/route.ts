import { apiSuccess } from "@/lib/api/response";
import { getConnectionState } from "@/lib/connection-state";

/**
 * Canonical connection health endpoint for UI clients.
 */
export async function GET() {
  const connection = await getConnectionState();
  return apiSuccess({ connection });
}
