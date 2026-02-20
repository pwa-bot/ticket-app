export function isAuthStatusCode(status: number | null | undefined): boolean {
  return status === 401 || status === 403;
}

export function shouldShowReconnectCta(status: number | null | undefined): boolean {
  return isAuthStatusCode(status);
}
