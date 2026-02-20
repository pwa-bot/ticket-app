const SPACE_FALLBACK = "/space";

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

  return true;
}

export function normalizeReturnTo(value: string | null | undefined, fallback = SPACE_FALLBACK): string {
  return isSafeInternalReturnTo(value) ? value : fallback;
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
