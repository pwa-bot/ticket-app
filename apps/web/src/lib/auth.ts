import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { apiError } from "@/lib/api/response";
import { isDevAuthBypassEnabled } from "@/lib/security/auth-bypass";

const SESSION_COOKIE = "ticket_app_session";
const OAUTH_STATE_COOKIE = "ticket_app_oauth_state";
const SELECTED_REPO_COOKIE = "ticket_app_repo";

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
  token: string;
  userId: string;
  githubLogin: string;
}

const UNAUTHORIZED_MESSAGE = "Unauthorized";

export async function getSession(): Promise<SessionData | null> {
  // DEV ONLY: bypass auth for local QA (hard-disabled outside development)
  if (isDevAuthBypassEnabled()) {
    return {
      token: "dev-bypass-token",
      userId: process.env.DEV_BYPASS_USER_ID!,
      githubLogin: "dev-user",
    };
  }

  const store = await cookies();
  const encrypted = store.get(SESSION_COOKIE)?.value;
  if (!encrypted) {
    return null;
  }

  const decrypted = decryptToken(encrypted);
  if (!decrypted) {
    return null;
  }

  try {
    // Try new format (JSON)
    const parsed = JSON.parse(decrypted);
    if (parsed.token && parsed.userId) {
      return parsed as SessionData;
    }
  } catch {
    // Fall back to old format (plain token string)
    return {
      token: decrypted,
      userId: "legacy",
      githubLogin: "unknown",
    };
  }

  return null;
}

export async function requireSession(): Promise<SessionData> {
  const session = await getSession();
  if (!session?.token || !session?.userId) {
    throw apiError(UNAUTHORIZED_MESSAGE, { status: 401 });
  }
  return {
    userId: session.userId,
    token: session.token,
    githubLogin: session.githubLogin ?? "unknown",
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

export const cookieNames = {
  session: SESSION_COOKIE,
  oauthState: OAUTH_STATE_COOKIE,
  selectedRepo: SELECTED_REPO_COOKIE,
};
