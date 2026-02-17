import { simpleGit } from "simple-git";
import { assertGitRepository } from "../lib/git.js";
import { readIndex } from "../lib/io.js";
import { resolveTicket } from "../lib/resolve.js";

export interface BranchCommandOptions {
  ci?: boolean;
}

function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const truncated = slug.slice(0, 50).replace(/-+$/g, "");
  return truncated || "ticket";
}

function branchNameForTicket(shortId: string, title: string): string {
  return `tk-${shortId.toLowerCase()}-${slugifyTitle(title)}`;
}

export async function runBranch(cwd: string, id: string, options: BranchCommandOptions): Promise<string> {
  await assertGitRepository(cwd);
  const index = await readIndex(cwd);
  const ticket = resolveTicket(index, id, options.ci ?? false);
  const branchName = branchNameForTicket(ticket.short_id, ticket.title);

  if (options.ci) {
    console.log(branchName);
    return branchName;
  }

  const git = simpleGit({ baseDir: cwd });
  const branches = await git.branchLocal();
  if (branches.all.includes(branchName)) {
    await git.checkout(branchName);
    console.log(`Checked out ${branchName}`);
    return branchName;
  }

  await git.checkoutLocalBranch(branchName);
  console.log(`Created and checked out ${branchName}`);
  return branchName;
}
