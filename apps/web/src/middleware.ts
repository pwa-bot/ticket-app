import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "ticket_app_session";

// Marketing pages that should redirect to dashboard if logged in
const MARKETING_REDIRECTS = new Set(["/"]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);

  // Redirect logged-in users from marketing homepage to dashboard
  if (hasSession && MARKETING_REDIRECTS.has(pathname)) {
    return NextResponse.redirect(new URL("/repos", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
