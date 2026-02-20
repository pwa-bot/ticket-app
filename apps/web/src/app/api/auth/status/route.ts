import { isUnauthorizedResponse, requireSession } from "@/lib/auth";
import { apiSuccess } from "@/lib/api/response";

export async function GET() {
  try {
    await requireSession();
    return apiSuccess({ authenticated: true });
  } catch (error) {
    if (isUnauthorizedResponse(error)) {
      return apiSuccess({ authenticated: false });
    }
    throw error;
  }
}
