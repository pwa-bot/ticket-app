import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { apiError } from "@/lib/api/response";
import {
  cookieNames,
  createAuthSession,
  destroySessionById,
  getSessionIdFromRequest,
  isUnauthorizedResponse,
  requireSession,
} from "@/lib/auth";
import { normalizeReturnTo } from "@/lib/auth-return-to";
import { getCanonicalBaseUrl, toCanonicalUrl } from "@/lib/app-url";
import { db, schema } from "@/db/client";
import {
  expiredCookieOptions,
  oauthStateCookieOptions,
  sessionCookieOptions,
} from "@/lib/security/cookies";
import { issueCsrfToken, setCsrfCookie } from "@/lib/security/csrf";

function readCookieValue(request: Request, cookieName: string): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookie = cookieHeader
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${cookieName}=`));

  if (!cookie) {
    return null;
  }

  const separatorIndex = cookie.indexOf("=");
  const value = separatorIndex >= 0 ? cookie.slice(separatorIndex + 1) : null;

  if (!value) {
    return null;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function generateUlid(): string {
  // Simple ULID-like ID generator
  const timestamp = Date.now().toString(36);
  const random = randomBytes(10).toString("hex");
  return `${timestamp}${random}`.toUpperCase().slice(0, 26);
}

async function hasSession(): Promise<boolean> {
  try {
    await requireSession();
    return true;
  } catch (error) {
    if (isUnauthorizedResponse(error)) {
      return false;
    }
    throw error;
  }
}

function hasSessionCookieInRequest(request: Request): boolean {
  return Boolean(getSessionIdFromRequest(request));
}

function getOnboardingCallbackReturnTo(url: URL): string {
  const params = new URLSearchParams(url.searchParams);
  params.delete("returnTo");
  const query = params.toString();
  return query ? `/space/onboarding/callback?${query}` : "/space/onboarding/callback";
}

export async function GET(request: Request) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return apiError("Missing GitHub OAuth environment variables", { status: 500 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const installationId = url.searchParams.get("installation_id");
  const redirectUri = `${getCanonicalBaseUrl(request)}/api/auth/github`;

  // Check for force re-auth (from reconnect flow)
  const forceReauth = url.searchParams.get("force") === "1";

  const requestedReturnTo = normalizeReturnTo(url.searchParams.get("returnTo"));
  const installationReturnTo = normalizeReturnTo(getOnboardingCallbackReturnTo(url));

  // If user already has a valid session and no OAuth params, redirect to requested destination.
  // Unless force=1 which means we want to re-authenticate.
  if (!code && !installationId && !forceReauth) {
    if (hasSessionCookieInRequest(request) || await hasSession()) {
      return NextResponse.redirect(toCanonicalUrl(request, requestedReturnTo));
    }
  }

  // Case 1: Start OAuth flow
  if (!code && !installationId) {
    const generatedState = randomBytes(16).toString("hex");

    const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("state", generatedState);
    authorizeUrl.searchParams.set("scope", "read:user user:email");

    const response = NextResponse.redirect(authorizeUrl);
    response.cookies.set(cookieNames.oauthState, generatedState, oauthStateCookieOptions());
    response.cookies.set(cookieNames.oauthReturnTo, requestedReturnTo, oauthStateCookieOptions());

    return response;
  }

  // Case 2: Returned from GitHub App install
  if (installationId && !code) {
    // User already has a session (or at least a session cookie), continue onboarding callback flow if possible
    if (hasSessionCookieInRequest(request) || await hasSession()) {
      return NextResponse.redirect(toCanonicalUrl(request, installationReturnTo));
    }

    // No session, need to log in first
    const generatedState = randomBytes(16).toString("hex");

    const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("state", generatedState);
    authorizeUrl.searchParams.set("scope", "read:user user:email");

    const response = NextResponse.redirect(authorizeUrl);
    response.cookies.set(cookieNames.oauthState, generatedState, oauthStateCookieOptions());
    response.cookies.set(cookieNames.oauthReturnTo, installationReturnTo, oauthStateCookieOptions());

    return response;
  }

  // Case 3: No code (shouldn't happen)
  if (!code) {
    return NextResponse.redirect(toCanonicalUrl(request, "/"));
  }

  // Validate state
  const expectedState = readCookieValue(request, cookieNames.oauthState);

  if (!state || !expectedState || state !== expectedState) {
    return apiError("Invalid OAuth state", { status: 400 });
  }

  const cookieReturnTo = normalizeReturnTo(readCookieValue(request, cookieNames.oauthReturnTo));
  const finalReturnTo = normalizeReturnTo(url.searchParams.get("returnTo") ?? cookieReturnTo);

  // Exchange code for token
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
    return apiError("Failed to complete OAuth exchange", { status: 502 });
  }

  const tokenData = (await tokenResponse.json()) as { access_token?: string; error?: string };

  if (!tokenData.access_token || tokenData.error) {
    if (tokenData.error === "bad_verification_code") {
      const retryUrl = new URL("/api/auth/github", getCanonicalBaseUrl(request));
      retryUrl.searchParams.set("force", "1");
      retryUrl.searchParams.set("returnTo", finalReturnTo);
      return NextResponse.redirect(retryUrl);
    }

    return apiError(tokenData.error ?? "OAuth did not return an access token", { status: 400 });
  }

  // Fetch user info from GitHub
  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!userResponse.ok) {
    return apiError("Failed to fetch user info", { status: 502 });
  }

  const githubUser = (await userResponse.json()) as { id: number; login: string; email?: string };

  // Create or update user in database
  const existingUser = await db.query.users.findFirst({
    where: eq(schema.users.githubUserId, githubUser.id),
  });

  let userId: string;

  if (!existingUser) {
    userId = generateUlid();
    await db.insert(schema.users).values({
      id: userId,
      githubUserId: githubUser.id,
      githubLogin: githubUser.login,
      email: githubUser.email ?? null,
    });
  } else {
    userId = existingUser.id;
    // Update login/email if changed
    await db
      .update(schema.users)
      .set({
        githubLogin: githubUser.login,
        email: githubUser.email ?? existingUser.email,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, existingUser.id));
  }

  // Auto-detect GitHub App installations for this user
  try {
    const installationsResponse = await fetch(
      "https://api.github.com/user/installations",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    if (installationsResponse.ok) {
      const installationsData = (await installationsResponse.json()) as {
        installations: Array<{
          id: number;
          account: { login: string; type: string };
        }>;
      };

      // Register each installation
      for (const inst of installationsData.installations) {
        const existingInstallation = await db.query.installations.findFirst({
          where: eq(schema.installations.githubInstallationId, inst.id),
        });

        let installationDbId: number;

        if (existingInstallation) {
          installationDbId = existingInstallation.id;
        } else {
          const [inserted] = await db
            .insert(schema.installations)
            .values({
              githubInstallationId: inst.id,
              githubAccountLogin: inst.account.login,
              githubAccountType: inst.account.type,
            })
            .returning({ id: schema.installations.id });
          installationDbId = inserted.id;
        }

        // Link user to installation
        await db
          .insert(schema.userInstallations)
          .values({
            userId,
            installationId: installationDbId,
          })
          .onConflictDoNothing();
      }
    }
  } catch (error) {
    console.error("[auth] Failed to auto-detect installations:", error);
    // Non-fatal, continue with login
  }

  // Redirect to onboarding if user has no GitHub App installations yet,
  // unless a safe returnTo destination was requested.
  const existingInstallation = await db.query.userInstallations.findFirst({
    where: eq(schema.userInstallations.userId, userId),
  });
  const defaultRedirectTo = existingInstallation ? "/space" : "/space/onboarding";
  const redirectTo = finalReturnTo === "/space" ? defaultRedirectTo : finalReturnTo;

  const previousSessionId = getSessionIdFromRequest(request);
  const { sessionId } = await createAuthSession({
    userId,
    githubLogin: githubUser.login,
    accessToken: tokenData.access_token,
  });
  try {
    await destroySessionById(previousSessionId);
  } catch (error) {
    console.error("[auth] Failed to delete previous server session:", error);
  }

  const response = NextResponse.redirect(toCanonicalUrl(request, redirectTo));
  response.cookies.set(cookieNames.session, sessionId, sessionCookieOptions());
  response.cookies.set(cookieNames.oauthState, "", expiredCookieOptions());
  response.cookies.set(cookieNames.oauthReturnTo, "", expiredCookieOptions());
  setCsrfCookie(response, issueCsrfToken());

  return response;
}
