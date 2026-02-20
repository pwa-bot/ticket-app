import { createHmac, timingSafeEqual } from "node:crypto";

const SPACE_FALLBACK = "/space";
const OAUTH_STATE_BINDING_VERSION = "v1";
const AUTH_RETURN_TO_ALLOWLIST_PREFIXES = ["/space", "/board", "/repos"] as const;
const OAUTH_STATE_SIGNATURE_ALGORITHM = "sha256";

export function isSafeInternalReturnTo(value: string | null | undefined): value is string {
  if (!value) {
    return false;
  }

  if (!value.startsWith("/")) {
    return false;
  }

  if (value.startsWith("//")) {
    return false;
  }

  if (/[\u0000-\u001F\u007F]/.test(value)) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(value, "http://localhost");
  } catch {
    return false;
  }

  if (parsed.origin !== "http://localhost") {
    return false;
  }

  return AUTH_RETURN_TO_ALLOWLIST_PREFIXES.some((prefix) => (
    parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`)
  ));
}

export function normalizeReturnTo(value: string | null | undefined, fallback = SPACE_FALLBACK): string {
  return isSafeInternalReturnTo(value) ? value : fallback;
}

function timingSafeEqualString(a: string, b: string): boolean {
  const leftBuffer = Buffer.from(a, "utf8");
  const rightBuffer = Buffer.from(b, "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function getOAuthStateBindingSecret(env: NodeJS.ProcessEnv): string {
  const secret = env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is required");
  }
  return secret;
}

function createOAuthStateSignature(state: string, returnTo: string, secret: string): string {
  return createHmac(OAUTH_STATE_SIGNATURE_ALGORITHM, secret)
    .update(`${OAUTH_STATE_BINDING_VERSION}:${state}:${returnTo}`)
    .digest("hex");
}

export function createOAuthStateBinding(
  state: string,
  returnTo: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const secret = getOAuthStateBindingSecret(env);
  const signature = createOAuthStateSignature(state, returnTo, secret);
  return `${OAUTH_STATE_BINDING_VERSION}:${state}:${signature}`;
}

export function validateOAuthStateBinding(input: {
  providedState: string | null | undefined;
  stateBindingCookie: string | null | undefined;
  returnTo: string;
  env?: NodeJS.ProcessEnv;
}): boolean {
  const { providedState, stateBindingCookie, returnTo, env } = input;
  if (!providedState || !stateBindingCookie) {
    return false;
  }

  if (!/^[a-f0-9]{32}$/i.test(providedState)) {
    return false;
  }

  const [version, boundState, signature, ...rest] = stateBindingCookie.split(":");
  if (rest.length > 0 || version !== OAUTH_STATE_BINDING_VERSION || !boundState) {
    return false;
  }

  if (!/^[a-f0-9]{32}$/i.test(boundState)) {
    return false;
  }

  if (!timingSafeEqualString(providedState, boundState)) {
    return false;
  }

  if (!signature) {
    return false;
  }

  if (!/^[a-f0-9]{64}$/i.test(signature)) {
    return false;
  }

  if (!isSafeInternalReturnTo(returnTo)) {
    return false;
  }

  try {
    const secret = getOAuthStateBindingSecret(env ?? process.env);
    const expectedSignature = createOAuthStateSignature(boundState, returnTo, secret);
    return timingSafeEqualString(signature, expectedSignature);
  } catch {
    return false;
  }
}

export function buildGithubAuthPath(returnTo: string): string {
  return `/api/auth/github?returnTo=${encodeURIComponent(normalizeReturnTo(returnTo))}`;
}

export function withSearchParams(
  pathname: string,
  searchParams: Record<string, string | string[] | undefined>
): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, item);
      }
      continue;
    }

    if (typeof value === "string") {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
