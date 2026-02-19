import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { cookieNames, encryptToken, getAccessTokenFromCookies } from "@/lib/auth";
import { db, schema } from "@/db/client";

function getBaseUrl(request: Request): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function generateUlid(): string {
  // Simple ULID-like ID generator
  const timestamp = Date.now().toString(36);
  const random = randomBytes(10).toString("hex");
  return `${timestamp}${random}`.toUpperCase().slice(0, 26);
}

export async function GET(request: Request) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Missing GitHub OAuth environment variables" }, { status: 500 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const installationId = url.searchParams.get("installation_id");
  const redirectUri = `${getBaseUrl(request)}/api/auth/github`;

  // Check for force re-auth (from reconnect flow)
  const forceReauth = url.searchParams.get("force") === "1";
  
  // If user already has a valid session and no OAuth params, redirect to space
  // Unless force=1 which means we want to re-authenticate
  if (!code && !installationId && !forceReauth) {
    const existingToken = await getAccessTokenFromCookies();
    if (existingToken) {
      return NextResponse.redirect(new URL("/space", request.url));
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
    response.cookies.set(cookieNames.oauthState, generatedState, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 10,
    });

    return response;
  }

  // Case 2: Returned from GitHub App install - just redirect to space
  // The installation will be auto-detected on next login or we can refresh
  if (installationId && !code) {
    // User already has a session, just go to space
    const existingToken = await getAccessTokenFromCookies();
    if (existingToken) {
      return NextResponse.redirect(new URL("/space", request.url));
    }

    // No session, need to log in first
    const generatedState = randomBytes(16).toString("hex");

    const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("state", generatedState);
    authorizeUrl.searchParams.set("scope", "read:user user:email");
    
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

  // Case 3: No code (shouldn't happen)
  if (!code) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Validate state
  const cookieHeader = request.headers.get("cookie") ?? "";
  const expectedState = cookieHeader
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${cookieNames.oauthState}=`))
    ?.split("=")[1];

  if (!state || !expectedState || state !== expectedState) {
    return NextResponse.json({ error: "Invalid OAuth state" }, { status: 400 });
  }

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
    return NextResponse.json({ error: "Failed to complete OAuth exchange" }, { status: 502 });
  }

  const tokenData = (await tokenResponse.json()) as { access_token?: string; error?: string };

  if (!tokenData.access_token || tokenData.error) {
    return NextResponse.json({ error: tokenData.error ?? "OAuth did not return an access token" }, { status: 400 });
  }

  // Fetch user info from GitHub
  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!userResponse.ok) {
    return NextResponse.json({ error: "Failed to fetch user info" }, { status: 502 });
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

  // Redirect to onboarding if user has no GitHub App installations yet
  const existingInstallation = await db.query.userInstallations.findFirst({
    where: eq(schema.userInstallations.userId, userId),
  });
  const redirectTo = existingInstallation ? "/space" : "/space/onboarding";

  // Create session with both token and user ID
  const sessionData = JSON.stringify({
    token: tokenData.access_token,
    userId,
    githubLogin: githubUser.login,
  });

  const response = NextResponse.redirect(new URL(redirectTo, request.url));
  response.cookies.set(cookieNames.session, encryptToken(sessionData), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  response.cookies.set(cookieNames.oauthState, "", { maxAge: 0, path: "/" });

  return response;
}
