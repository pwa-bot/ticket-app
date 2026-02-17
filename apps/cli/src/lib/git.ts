import path from "node:path";
import { simpleGit, type StatusResult } from "simple-git";
import { ERROR_CODE, EXIT_CODE, TicketError } from "./errors.js";

export async function assertGitRepository(cwd: string): Promise<void> {
  const git = simpleGit({ baseDir: cwd });
  const isRepo = await git.checkIsRepo();
  if (!isRepo) {
    throw new TicketError(ERROR_CODE.NOT_GIT_REPO, "Not a git repository", EXIT_CODE.NOT_GIT_REPO);
  }
}

export async function autoCommit(cwd: string, files: string[], message: string): Promise<void> {
  const git = simpleGit({ baseDir: cwd });
  const isRepo = await git.checkIsRepo();
  if (!isRepo) {
    return;
  }

  const relativeFiles = files.map((file) => path.relative(cwd, file));
  await git.add(relativeFiles);

  const status: StatusResult = await git.status();
  const touched = new Set(status.files.map((file) => file.path));
  const hasRelevantChanges = relativeFiles.some((file) => touched.has(file));

  if (!hasRelevantChanges) {
    return;
  }

  await git.commit(message, relativeFiles);
}
