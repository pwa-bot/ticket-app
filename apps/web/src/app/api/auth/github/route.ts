import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { cookieNames, encryptToken, getAccessTokenFromCookies } from "@/lib/auth";

function getBaseUrl(request: Request): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export async function GET(request: Request) {
  // Use standalone OAuth App for user auth (sees all user repos)
  // GitHub App OAuth only sees repos where app is installed
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Missing GitHub OAuth environment variables" }, { status: 500 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const installationId = url.searchParams.get("installation_id");
  const setupAction = url.searchParams.get("setup_action");
  const redirectUri = `${getBaseUrl(request)}/api/auth/github`;

  // If user already has a valid session and no OAuth params, just redirect to space
  if (!code && !installationId) {
    const existingToken = await getAccessTokenFromCookies();
    if (existingToken) {
      return NextResponse.redirect(new URL("/space", request.url));
    }
  }

  // Case 1: No OAuth code yet - start OAuth flow
  // We go straight to OAuth (not install) because:
  // - If app isn't installed, user can install later from a prompt
  // - If app is installed, /installations/new redirects to settings (broken UX)
  if (!code && !installationId) {
    const generatedState = randomBytes(16).toString("hex");
    
    const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("state", generatedState);
    authorizeUrl.searchParams.set("scope", "repo");
    
    const response = NextResponse.redirect(authorizeUrl);
    response.cookies.set(cookieNames.oauthState, generatedState, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 10,
    });

    return response;
  }

  // Case 2: Returned from installation without OAuth code - redirect to OAuth
  if (installationId && !code) {
    const generatedState = randomBytes(16).toString("hex");
    
    // Store installation_id for later
    const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("state", generatedState);
    authorizeUrl.searchParams.set("scope", "repo"); // Need repo scope to list all user repos
    
    const response = NextResponse.redirect(authorizeUrl);
    response.cookies.set(cookieNames.oauthState, generatedState, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 10,
    });
    // Store installation_id to record after OAuth
    response.cookies.set("ticket_app_installation_id", installationId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 10,
    });

    return response;
  }

  // Case 3: No code yet (shouldn't happen, but handle gracefully)
  if (!code) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const cookieHeader = request.headers.get("cookie") ?? "";
  const expectedState = cookieHeader
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${cookieNames.oauthState}=`))
    ?.split("=")[1];

  if (!state || !expectedState || state !== expectedState) {
    return NextResponse.json({ error: "Invalid OAuth state" }, { status: 400 });
  }

  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      state,
    }),
    cache: "no-store",
  });

  if (!tokenResponse.ok) {
    return NextResponse.json({ error: "Failed to complete OAuth exchange" }, { status: 502 });
  }

  const tokenData = (await tokenResponse.json()) as { access_token?: string; error?: string };

  if (!tokenData.access_token || tokenData.error) {
    return NextResponse.json({ error: tokenData.error ?? "OAuth did not return an access token" }, { status: 400 });
  }

  const response = NextResponse.redirect(new URL("/space", request.url));
  response.cookies.set(cookieNames.session, encryptToken(tokenData.access_token), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  response.cookies.set(cookieNames.oauthState, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}
