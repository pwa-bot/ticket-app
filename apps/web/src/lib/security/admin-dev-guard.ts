import { NextRequest } from "next/server";
import { apiError } from "@/lib/api/response";

/**
 * Allows sensitive recovery endpoints when:
 * - running in development, OR
 * - request provides a valid admin repair token header.
 */
export function ensureAdminOrDev(request: NextRequest): Response | null {
  if (process.env.NODE_ENV === "development") {
    return null;
  }

  const configuredToken = process.env.ADMIN_REPAIR_TOKEN;
  const providedToken = request.headers.get("x-admin-repair-token");

  if (configuredToken && providedToken === configuredToken) {
    return null;
  }

  return apiError("Forbidden", {
    status: 403,
    details: {
      reasonCode: "admin_guard_required",
      message: "Provide x-admin-repair-token or run in development.",
    },
  });
}
