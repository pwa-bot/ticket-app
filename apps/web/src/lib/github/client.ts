import { Octokit } from "octokit";

/**
 * Creates an Octokit client from a provided token
 */
export function createOctokit(token: string): Octokit {
  return new Octokit({ auth: token });
}
