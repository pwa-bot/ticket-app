import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { eq, lte } from "drizzle-orm";
import { cookies } from "next/headers";
import { db, schema } from "@/db/client";
import { apiError } from "@/lib/api/response";
import { createOpaqueToken } from "@/lib/security/cookies";
import { isDevAuthBypassEnabled } from "@/lib/security/auth-bypass";

const SESSION_COOKIE = "ticket_app_session";
const OAUTH_STATE_COOKIE = "ticket_app_oauth_state";
const OAUTH_RETURN_TO_COOKIE = "ticket_app_oauth_return_to";
const SELECTED_REPO_COOKIE = "ticket_app_repo";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const SESSION_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastSessionCleanupAt = 0;

function getSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is required");
  }
  return secret;
}

function getKey(): Buffer {
  return createHash("sha256").update(getSecret()).digest();
}

export function encryptToken(token: string): string {
  const iv = randomBytes(12);
  const key = getKey();
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptToken(payload: string): string | null {
  try {
    const [ivPart, tagPart, dataPart] = payload.split(".");
    if (!ivPart || !tagPart || !dataPart) {
      return null;
    }

    const key = getKey();
    const iv = Buffer.from(ivPart, "base64url");
    const tag = Buffer.from(tagPart, "base64url");
    const encrypted = Buffer.from(dataPart, "base64url");

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

export interface SessionData {
  sessionId: string;
  token: string;
  userId: string;
  githubLogin: string;
  expiresAt: Date;
}

const UNAUTHORIZED_MESSAGE = "Unauthorized";

function isOpaqueSessionId(value: string): boolean {
  return value.length >= 32 && !value.includes(".");
}

function parseCookieValue(cookieHeader: string | null, cookieName: string): string | null {
  const header = cookieHeader ?? "";
  const cookie = header
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

async function maybeCleanupExpiredSessions(): Promise<void> {
  const nowMs = Date.now();
  if (nowMs - lastSessionCleanupAt < SESSION_CLEANUP_INTERVAL_MS) {
    return;
  }

  lastSessionCleanupAt = nowMs;
  await db.delete(schema.authSessions).where(lte(schema.authSessions.expiresAt, new Date(nowMs)));
}

export async function createAuthSession(input: {
  userId: string;
  githubLogin: string;
  accessToken: string;
}): Promise<{ sessionId: string; expiresAt: Date }> {
  const sessionId = createOpaqueToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(schema.authSessions).values({
    id: sessionId,
    userId: input.userId,
    githubLogin: input.githubLogin,
    accessTokenEncrypted: encryptToken(input.accessToken),
    expiresAt,
    lastSeenAt: new Date(),
  });

  void maybeCleanupExpiredSessions().catch((error) => {
    console.error("[auth] Failed to cleanup expired sessions:", error);
  });

  return { sessionId, expiresAt };
}

export async function destroySessionById(sessionId: string | null | undefined): Promise<void> {
  if (!sessionId) {
    return;
  }

  await db.delete(schema.authSessions).where(eq(schema.authSessions.id, sessionId));
}

export function getSessionIdFromRequest(request: Request): string | null {
  const value = parseCookieValue(request.headers.get("cookie"), SESSION_COOKIE);
  if (!value || !isOpaqueSessionId(value)) {
    return null;
  }
  return value;
}

export async function getSession(): Promise<SessionData | null> {
  // DEV ONLY: bypass auth for local QA (hard-disabled outside development)
  if (isDevAuthBypassEnabled()) {
    return {
      sessionId: "dev-bypass-session",
      token: "dev-bypass-token",
      userId: process.env.DEV_BYPASS_USER_ID!,
      githubLogin: "dev-user",
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    };
  }

  const store = await cookies();
  const cookieValue = store.get(SESSION_COOKIE)?.value;
  if (!cookieValue) {
    return null;
  }

  // Legacy fallback: encrypted JSON payload stored directly in cookie.
  if (!isOpaqueSessionId(cookieValue)) {
    const decrypted = decryptToken(cookieValue);
    if (!decrypted) {
      return null;
    }

    try {
      const parsed = JSON.parse(decrypted) as {
        token?: string;
        userId?: string;
        githubLogin?: string;
      };

      if (!parsed.token || !parsed.userId) {
        return null;
      }

      return {
        sessionId: "legacy-cookie-session",
        token: parsed.token,
        userId: parsed.userId,
        githubLogin: parsed.githubLogin ?? "unknown",
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      };
    } catch {
      return null;
    }
  }

  const sessionId = cookieValue;
  const sessionRow = await db.query.authSessions.findFirst({
    where: eq(schema.authSessions.id, sessionId),
  });

  if (!sessionRow) {
    return null;
  }

  if (sessionRow.expiresAt.getTime() <= Date.now()) {
    await destroySessionById(sessionId);
    return null;
  }

  const token = decryptToken(sessionRow.accessTokenEncrypted);
  if (!token) {
    await destroySessionById(sessionId);
    return null;
  }

  if (Date.now() - sessionRow.lastSeenAt.getTime() >= SESSION_TOUCH_INTERVAL_MS) {
    void db
      .update(schema.authSessions)
      .set({ lastSeenAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.authSessions.id, sessionId))
      .catch((error) => {
        console.error("[auth] Failed to touch auth session:", error);
      });
  }

  void maybeCleanupExpiredSessions().catch((error) => {
    console.error("[auth] Failed to cleanup expired sessions:", error);
  });

  return {
    sessionId,
    token,
    userId: sessionRow.userId,
    githubLogin: sessionRow.githubLogin,
    expiresAt: sessionRow.expiresAt,
  };
}

export async function requireSession(): Promise<SessionData> {
  const session = await getSession();
  if (!session?.token || !session?.userId) {
    throw apiError(UNAUTHORIZED_MESSAGE, { status: 401 });
  }
  return {
    sessionId: session.sessionId,
    userId: session.userId,
    token: session.token,
    githubLogin: session.githubLogin ?? "unknown",
    expiresAt: session.expiresAt,
  };
}

export function isUnauthorizedResponse(error: unknown): error is Response {
  return error instanceof Response && error.status === 401;
}

export function isAuthFailureResponse(error: unknown): error is Response {
  return error instanceof Response && (error.status === 401 || error.status === 403);
}

export async function getAccessTokenFromCookies(): Promise<string | null> {
  const session = await getSession();
  return session?.token ?? null;
}

export async function hasSessionCookie(): Promise<boolean> {
  const store = await cookies();
  const cookieValue = store.get(SESSION_COOKIE)?.value;
  return Boolean(cookieValue);
}

export const cookieNames = {
  session: SESSION_COOKIE,
  oauthState: OAUTH_STATE_COOKIE,
  oauthReturnTo: OAUTH_RETURN_TO_COOKIE,
  selectedRepo: SELECTED_REPO_COOKIE,
};
