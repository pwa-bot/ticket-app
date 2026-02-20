import { NextRequest, NextResponse } from "next/server";
import { isAuthFailureResponse, requireSession } from "@/lib/auth";
import {
  CSRF_COOKIE_NAME,
  isCsrfProtectionEnabled,
  issueCsrfToken,
  setCsrfCookie,
} from "@/lib/security/csrf";

export async function GET(req: NextRequest) {
  try {
    await requireSession();

    const existingToken = req.cookies.get(CSRF_COOKIE_NAME)?.value;
    const csrfToken = existingToken ?? issueCsrfToken();
    const response = NextResponse.json({ csrfToken, enforced: isCsrfProtectionEnabled() });

    if (!existingToken) {
      setCsrfCookie(response, csrfToken);
    }

    return response;
  } catch (error) {
    if (isAuthFailureResponse(error)) {
      return error;
    }

    return NextResponse.json({ error: "Failed to issue CSRF token" }, { status: 500 });
  }
}
