import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/github/app/install-url
 * 
 * Returns the GitHub App installation URL.
 */
export async function GET(req: NextRequest) {
  const redirect = req.nextUrl.searchParams.get("redirect") ?? "/space/onboarding/callback";
  const appSlug = process.env.GITHUB_APP_SLUG ?? "ticketdotapp";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://ticket.app";
  
  const installUrl = `https://github.com/apps/${appSlug}/installations/new`;
  
  // Note: GitHub App redirects to the configured Setup URL, not this redirect param
  // This is just for reference
  return NextResponse.json({ 
    url: installUrl,
    setupUrl: `${baseUrl}${redirect}`,
  });
}
