import { Octokit } from "octokit";
import { getAccessTokenFromCookies } from "@/lib/auth";

/**
 * Creates an authenticated Octokit client from the session cookie
 * @returns Octokit instance or null if not authenticated
 */
export async function getOctokitFromSession(): Promise<Octokit | null> {
  const token = await getAccessTokenFromCookies();
  if (!token) {
    return null;
  }
  return new Octokit({ auth: token });
}

/**
 * Creates an Octokit client from a provided token
 */
export function createOctokit(token: string): Octokit {
  return new Octokit({ auth: token });
}
