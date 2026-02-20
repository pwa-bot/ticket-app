function parseAbsoluteUrl(value: string | undefined): URL | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    if (!parsed.protocol || !parsed.host) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function getConfiguredAppOrigin(env: NodeJS.ProcessEnv = process.env): string | null {
  const configured = parseAbsoluteUrl(env.APP_URL) ?? parseAbsoluteUrl(env.NEXT_PUBLIC_APP_URL);
  return configured ? configured.origin : null;
}

export function getCanonicalBaseUrl(request: Request, env: NodeJS.ProcessEnv = process.env): string {
  const requestOrigin = new URL(request.url).origin;
  const configuredOrigin = getConfiguredAppOrigin(env);

  // Prefer request origin to avoid cross-host auth/cookie loops (e.g. localhost vs 127.0.0.1 vs custom domain).
  // Allow explicit override only when APP_URL_FORCE=true.
  if (env.APP_URL_FORCE === "true" && configuredOrigin) {
    return configuredOrigin;
  }

  return requestOrigin || configuredOrigin || "http://localhost:3000";
}

export function toCanonicalUrl(request: Request, path: string, env: NodeJS.ProcessEnv = process.env): URL {
  return new URL(path, getCanonicalBaseUrl(request, env));
}
