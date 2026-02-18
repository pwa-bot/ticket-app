import { Octokit } from "octokit";
import { createAppAuth } from "@octokit/auth-app";

/**
 * Get an Octokit instance authenticated as the GitHub App itself.
 * Used for fetching installation details.
 */
export function getAppOctokit(): Octokit {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

  if (!appId || !privateKey) {
    throw new Error("Missing GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY");
  }

  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId,
      privateKey,
    },
  });
}

/**
 * Get an Octokit instance authenticated as a specific installation.
 * Used for accessing repos the installation has access to.
 */
export function getInstallationOctokit(installationId: number): Octokit {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

  if (!appId || !privateKey) {
    throw new Error("Missing GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY");
  }

  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId,
      privateKey,
      installationId,
    },
  });
}

/**
 * Get the GitHub App install URL.
 */
export function getAppInstallUrl(redirectUrl?: string): string {
  const appSlug = process.env.GITHUB_APP_SLUG ?? "ticketdotapp";
  const baseUrl = `https://github.com/apps/${appSlug}/installations/new`;
  
  if (redirectUrl) {
    return `${baseUrl}?redirect_url=${encodeURIComponent(redirectUrl)}`;
  }
  
  return baseUrl;
}
