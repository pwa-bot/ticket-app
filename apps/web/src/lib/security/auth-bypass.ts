export interface AuthBypassEnv {
  NODE_ENV?: string;
  DEV_BYPASS_AUTH?: string;
  DEV_BYPASS_USER_ID?: string;
}

export function isDevAuthBypassEnabled(env: AuthBypassEnv = process.env): boolean {
  return (
    env.NODE_ENV === "development" &&
    env.DEV_BYPASS_AUTH === "true" &&
    typeof env.DEV_BYPASS_USER_ID === "string" &&
    env.DEV_BYPASS_USER_ID.length > 0
  );
}
