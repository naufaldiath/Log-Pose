import path from 'path';
import fs from 'fs/promises';
import { createGit } from './git.js';
import { validateRepoExists } from '../utils/path-safety.js';

/**
 * Worktree service - manages per-user branch isolation via git worktrees
 *
 * Worktree structure:
 *   Base repo: /repo-root/myrepo/
 *   Worktrees: /repo-root/myrepo/.worktrees/{sanitizedEmail}/{branch}/
 */

const WORKTREES_DIR = '.worktrees';

/**
 * Sanitizes an email address for use in filesystem paths
 * Replaces special characters that could cause issues
 */
export function sanitizeEmail(email: string): string {
  // Replace @ with _at_ and . with _dot_
  // Also remove/replace any other potentially problematic characters
  return email
    .toLowerCase()
    .replace(/@/g, '_at_')
    .replace(/\./g, '_dot_')
    .replace(/[^a-z0-9_-]/g, '_');
}

/**
 * Validates a branch name to prevent path traversal and other attacks
 * Returns true if the branch name is safe to use
 */
export function validateBranchName(branch: string): boolean {
  if (!branch || branch.length === 0) {
    return false;
  }

  // Check for path traversal attempts
  if (branch.includes('..') || branch.includes('/') || branch.includes('\\')) {
    return false;
  }

  // Check for invalid characters in branch names
  // Git branch names cannot contain: ~ ^ : \ * [ ] space tab
  if (/[~^:\\\*\[\]\s]/.test(branch)) {
    return false;
  }

  // Cannot start with a dash
  if (branch.startsWith('-')) {
    return false;
  }

  // Cannot be @ or contain @{
  if (branch === '@' || branch.includes('@{')) {
    return false;
  }

  return true;
}

/**
 * Gets the worktree path for a given user and branch
 */
export function getWorktreePath(repoPath: string, userEmail: string, branch: string): string {
  const sanitizedEmail = sanitizeEmail(userEmail);
  return path.join(repoPath, WORKTREES_DIR, sanitizedEmail, branch);
}

/**
 * Checks if a worktree exists for the given user and branch
 */
export async function worktreeExists(repoPath: string, userEmail: string, branch: string): Promise<boolean> {
  const worktreePath = getWorktreePath(repoPath, userEmail, branch);

  try {
    const stats = await fs.stat(worktreePath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Ensures the worktrees directory structure exists
 */
async function ensureWorktreesDir(repoPath: string, userEmail: string): Promise<string> {
  const sanitizedEmail = sanitizeEmail(userEmail);
  const worktreesBase = path.join(repoPath, WORKTREES_DIR, sanitizedEmail);

  await fs.mkdir(worktreesBase, { recursive: true });
  return worktreesBase;
}

/**
 * Creates a worktree for the given user and branch
 * Returns the path to the worktree directory
 *
 * If the branch doesn't exist in the repo, it will be created from the current HEAD
 */
export async function createWorktree(
  repoPath: string,
  userEmail: string,
  branch: string
): Promise<string> {
  if (!(await validateRepoExists(repoPath))) {
    throw new Error(`Repository does not exist: ${repoPath}`);
  }

  if (!validateBranchName(branch)) {
    throw new Error(`Invalid branch name: ${branch}`);
  }

  const worktreePath = getWorktreePath(repoPath, userEmail, branch);

  // Check if worktree already exists
  if (await worktreeExists(repoPath, userEmail, branch)) {
    return worktreePath;
  }

  // Ensure parent directory exists
  await ensureWorktreesDir(repoPath, userEmail);

  const git = createGit(repoPath);

  // Check if the branch exists in the repo
  const branches = await git.branch(['-a']);
  const branchExists = branches.all.some(
    b => b === branch || b === `origin/${branch}` || b === `remotes/origin/${branch}`
  );

  if (branchExists) {
    // Create worktree from existing branch
    await git.raw(['worktree', 'add', worktreePath, branch]);
  } else {
    // Create a new branch and worktree from HEAD
    await git.raw(['worktree', 'add', '-b', branch, worktreePath]);
  }

  return worktreePath;
}

/**
 * Creates a worktree from an existing branch (fails if branch doesn't exist)
 */
export async function createWorktreeFromBranch(
  repoPath: string,
  userEmail: string,
  branch: string
): Promise<string> {
  if (!(await validateRepoExists(repoPath))) {
    throw new Error(`Repository does not exist: ${repoPath}`);
  }

  if (!validateBranchName(branch)) {
    throw new Error(`Invalid branch name: ${branch}`);
  }

  const worktreePath = getWorktreePath(repoPath, userEmail, branch);

  // Check if worktree already exists
  if (await worktreeExists(repoPath, userEmail, branch)) {
    return worktreePath;
  }

  // Ensure parent directory exists
  await ensureWorktreesDir(repoPath, userEmail);

  const git = createGit(repoPath);

  // Check if the branch exists locally
  const branches = await git.branch(['-a']);
  const localBranchExists = branches.all.includes(branch);
  const remoteBranchExists = branches.all.includes(`origin/${branch}`) ||
                             branches.all.includes(`remotes/origin/${branch}`);

  if (localBranchExists) {
    // Create worktree from existing local branch
    await git.raw(['worktree', 'add', worktreePath, branch]);
  } else if (remoteBranchExists) {
    // Create worktree from remote branch, tracking it
    const remoteBranch = branches.all.includes(`origin/${branch}`)
      ? `origin/${branch}`
      : `remotes/origin/${branch}`;
    await git.raw(['worktree', 'add', '--track', '-b', branch, worktreePath, remoteBranch]);
  } else {
    throw new Error(`Branch does not exist: ${branch}`);
  }

  return worktreePath;
}

/**
 * Creates a worktree with a new branch (creates branch from HEAD)
 */
export async function createWorktreeWithNewBranch(
  repoPath: string,
  userEmail: string,
  branch: string
): Promise<string> {
  if (!(await validateRepoExists(repoPath))) {
    throw new Error(`Repository does not exist: ${repoPath}`);
  }

  if (!validateBranchName(branch)) {
    throw new Error(`Invalid branch name: ${branch}`);
  }

  const worktreePath = getWorktreePath(repoPath, userEmail, branch);

  // Check if worktree already exists
  if (await worktreeExists(repoPath, userEmail, branch)) {
    throw new Error(`Worktree already exists for branch: ${branch}`);
  }

  // Ensure parent directory exists
  await ensureWorktreesDir(repoPath, userEmail);

  const git = createGit(repoPath);

  // Check if branch already exists locally
  const branches = await git.branch(['-a']);
  if (branches.all.includes(branch)) {
    throw new Error(`Branch already exists: ${branch}`);
  }

  // Create new branch and worktree from HEAD
  await git.raw(['worktree', 'add', '-b', branch, worktreePath]);

  return worktreePath;
}

/**
 * Removes a worktree directory
 * This removes the worktree but keeps the branch
 */
export async function cleanupWorktree(worktreePath: string): Promise<void> {
  try {
    // First, remove the worktree from git's tracking
    // We need to find the base repo path to run the git command
    const pathParts = worktreePath.split(path.sep);
    const worktreesIndex = pathParts.indexOf(WORKTREES_DIR);

    if (worktreesIndex > 0) {
      const repoPath = path.join(...pathParts.slice(0, worktreesIndex));
      const git = createGit(repoPath);

      try {
        // Remove worktree from git (this removes the entry but not necessarily the files)
        await git.raw(['worktree', 'remove', worktreePath, '--force']);
      } catch (removeError) {
        // Worktree might already be removed or force needed
        console.warn(`[Worktree] Error removing worktree from git: ${removeError}`);

        // Try pruning worktrees
        try {
          await git.raw(['worktree', 'prune']);
        } catch {
          // Ignore prune errors
        }
      }
    }

    // Clean up the directory if it still exists
    try {
      await fs.rm(worktreePath, { recursive: true, force: true });
    } catch (cleanupError) {
      console.warn(`[Worktree] Error cleaning up worktree directory: ${cleanupError}`);
    }
  } catch (error) {
    console.error(`[Worktree] Failed to cleanup worktree ${worktreePath}:`, error);
    // Don't throw - cleanup errors shouldn't break session management
  }
}

/**
 * Lists all worktrees for a repository
 */
export async function listWorktrees(repoPath: string): Promise<Array<{
  path: string;
  branch: string;
  isMain: boolean;
}>> {
  const git = createGit(repoPath);

  try {
    const result = await git.raw(['worktree', 'list', '--porcelain']);
    const worktrees: Array<{ path: string; branch: string; isMain: boolean }> = [];

    const lines = result.split('\n');
    let currentWorktree: { path: string; branch: string; isMain: boolean } | null = null;

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        if (currentWorktree) {
          worktrees.push(currentWorktree);
        }
        currentWorktree = {
          path: line.slice(9),
          branch: '',
          isMain: false,
        };
      } else if (line.startsWith('branch ')) {
        if (currentWorktree) {
          currentWorktree.branch = line.slice(7).replace('refs/heads/', '');
        }
      } else if (line === 'bare' || line === 'detached') {
        // Special worktree types
      }
    }

    if (currentWorktree) {
      worktrees.push(currentWorktree);
    }

    // The first worktree is typically the main one
    if (worktrees.length > 0) {
      worktrees[0].isMain = true;
    }

    return worktrees;
  } catch (error) {
    console.error(`[Worktree] Error listing worktrees: ${error}`);
    return [];
  }
}

/**
 * Gets the worktrees base directory for a user
 */
export function getUserWorktreesBasePath(repoPath: string, userEmail: string): string {
  const sanitizedEmail = sanitizeEmail(userEmail);
  return path.join(repoPath, WORKTREES_DIR, sanitizedEmail);
}

/**
 * Lists all worktrees for a specific user
 */
export async function listUserWorktrees(
  repoPath: string,
  userEmail: string
): Promise<Array<{ branch: string; path: string; createdAt: Date }>> {
  const userBasePath = getUserWorktreesBasePath(repoPath, userEmail);

  try {
    const entries = await fs.readdir(userBasePath, { withFileTypes: true });
    const worktrees: Array<{ branch: string; path: string; createdAt: Date }> = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const worktreePath = path.join(userBasePath, entry.name);
        try {
          const stats = await fs.stat(worktreePath);
          worktrees.push({
            branch: entry.name,
            path: worktreePath,
            createdAt: stats.ctime,
          });
        } catch {
          // Ignore directories we can't stat
        }
      }
    }

    return worktrees;
  } catch {
    // Directory doesn't exist or can't be read
    return [];
  }
}
