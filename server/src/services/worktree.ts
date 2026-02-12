import path from 'path';
import fs from 'fs/promises';
import { createGit } from './git.js';
import { validateRepoExists } from '../utils/path-safety.js';

/**
 * Worktree service - manages per-user branch isolation via git worktrees
 *
 * Worktree structure:
 *   Base repo: /repo-root/myrepo/
 *   Worktrees: /repo-root/myrepo/.worktrees/{shortUserId}/{branch}/
 */

const WORKTREES_DIR = '.worktrees';

/**
 * Validates a branch name to prevent path traversal and other attacks
 * Returns true if the branch name is safe to use
 *
 * Supports:
 * - Simple branch names (e.g., "main", "feature-branch")
 * - Namespaced branch names (e.g., "claude-session/user/main")
 */
export function validateBranchName(branch: string): boolean {
  if (!branch || branch.length === 0) {
    return false;
  }

  // Check for path traversal attempts
  if (branch.includes('..') || branch.includes('\\')) {
    return false;
  }

  // Check for invalid characters in branch names
  // Git branch names cannot contain: ~ ^ : \ * [ ] space tab
  // Note: We allow forward slashes for namespaced branches
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

  // Validate each path segment for namespaced branches
  // Each segment must not start or end with a dot, and must not be empty
  const segments = branch.split('/');
  for (const segment of segments) {
    if (segment.length === 0) {
      return false; // Empty segment (consecutive slashes)
    }
    if (segment.startsWith('.') || segment.endsWith('.')) {
      return false; // Segment starts/ends with dot
    }
  }

  return true;
}

/**
 * Gets the worktree path for a given user and branch
 */
export function getWorktreePath(repoPath: string, userEmail: string, branch: string): string {
  const shortUserId = getShortUserId(userEmail);
  return path.join(repoPath, WORKTREES_DIR, shortUserId, branch);
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
  const shortUserId = getShortUserId(userEmail);
  const worktreesBase = path.join(repoPath, WORKTREES_DIR, shortUserId);

  await fs.mkdir(worktreesBase, { recursive: true });
  return worktreesBase;
}

/**
 * Extracts a short user identifier from an email address
 * Uses only the local part (before @) and sanitizes it
 * Example: "naufaldi.rifqi@mekari.com" -> "naufaldi-rifqi"
 */
export function getShortUserId(email: string): string {
  // Get the local part (before @)
  const localPart = email.toLowerCase().split('@')[0] || email.toLowerCase();
  // Replace dots and other special chars with hyphens
  return localPart.replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Creates a user-specific branch name from a base branch
 * Format: logpose/{short-user-id}/{base-branch}
 */
export function createUserBranchName(userEmail: string, baseBranch: string): string {
  const shortUserId = getShortUserId(userEmail);
  return `logpose/${shortUserId}/${baseBranch}`;
}

/**
 * Creates a worktree for the given user and branch
 * Returns the path to the worktree directory
 *
 * For isolation, this creates a new user-specific branch from the selected base branch,
 * then creates a worktree from that new branch. This ensures:
 * - Each user has their own isolated workspace (worktree)
 * - Each user has their own branch to work on
 * - No conflicts with other users or the main repo's checked out branch
 */
export async function createWorktree(
  repoPath: string,
  userEmail: string,
  baseBranch: string
): Promise<string> {
  if (!(await validateRepoExists(repoPath))) {
    throw new Error(`Repository does not exist: ${repoPath}`);
  }

  if (!validateBranchName(baseBranch)) {
    throw new Error(`Invalid branch name: ${baseBranch}`);
  }

  // Create a user-specific branch name
  const userBranch = createUserBranchName(userEmail, baseBranch);

  // Use the base branch name for the worktree path (not the user-specific branch)
  // This makes the path cleaner and consistent
  const worktreePath = getWorktreePath(repoPath, userEmail, baseBranch);

  // Check if worktree already exists
  if (await worktreeExists(repoPath, userEmail, baseBranch)) {
    return worktreePath;
  }

  // Ensure parent directory exists
  await ensureWorktreesDir(repoPath, userEmail);

  const git = createGit(repoPath);

  // Check if the base branch exists in the repo
  const branches = await git.branch(['-a']);
  const baseBranchExists = branches.all.some(
    b => b === baseBranch || b === `origin/${baseBranch}` || b === `remotes/origin/${baseBranch}`
  );

  if (!baseBranchExists) {
    throw new Error(`Base branch '${baseBranch}' does not exist`);
  }

  // Check if user branch already exists locally
  const userBranchExists = branches.all.includes(userBranch);

  if (userBranchExists) {
    // User branch already exists, create worktree from it
    console.log(`[Worktree] Using existing user branch '${userBranch}'`);
    await git.raw(['worktree', 'add', worktreePath, userBranch]);
  } else {
    // Create a new user branch from the base branch and create worktree
    console.log(`[Worktree] Creating new user branch '${userBranch}' from '${baseBranch}'`);
    const baseBranchRef = branches.all.includes(baseBranch)
      ? baseBranch
      : `origin/${baseBranch}`;
    await git.raw(['worktree', 'add', '-b', userBranch, worktreePath, baseBranchRef]);
  }

  return worktreePath;
}

/**
 * Creates a worktree from an existing base branch.
 * Like createWorktree, this creates a user-specific branch for isolation.
 *
 * Throws error if the base branch doesn't exist.
 */
export async function createWorktreeFromBranch(
  repoPath: string,
  userEmail: string,
  baseBranch: string
): Promise<string> {
  if (!(await validateRepoExists(repoPath))) {
    throw new Error(`Repository does not exist: ${repoPath}`);
  }

  if (!validateBranchName(baseBranch)) {
    throw new Error(`Invalid branch name: ${baseBranch}`);
  }

  // Create a user-specific branch name
  const userBranch = createUserBranchName(userEmail, baseBranch);

  const worktreePath = getWorktreePath(repoPath, userEmail, baseBranch);

  // Check if worktree already exists
  if (await worktreeExists(repoPath, userEmail, baseBranch)) {
    return worktreePath;
  }

  // Ensure parent directory exists
  await ensureWorktreesDir(repoPath, userEmail);

  const git = createGit(repoPath);

  // Check if the base branch exists
  const branches = await git.branch(['-a']);
  const localBranchExists = branches.all.includes(baseBranch);
  const remoteBranchExists = branches.all.includes(`origin/${baseBranch}`) ||
                             branches.all.includes(`remotes/origin/${baseBranch}`);

  if (!localBranchExists && !remoteBranchExists) {
    throw new Error(`Branch '${baseBranch}' does not exist`);
  }

  // Check if user branch already exists locally
  const userBranchExists = branches.all.includes(userBranch);

  if (userBranchExists) {
    // User branch already exists, create worktree from it
    console.log(`[Worktree] Using existing user branch '${userBranch}'`);
    await git.raw(['worktree', 'add', worktreePath, userBranch]);
  } else if (localBranchExists) {
    // Create user branch from local base branch
    console.log(`[Worktree] Creating user branch '${userBranch}' from local '${baseBranch}'`);
    await git.raw(['worktree', 'add', '-b', userBranch, worktreePath, baseBranch]);
  } else {
    // Create user branch from remote base branch
    console.log(`[Worktree] Creating user branch '${userBranch}' from remote 'origin/${baseBranch}'`);
    const remoteBranch = branches.all.includes(`origin/${baseBranch}`)
      ? `origin/${baseBranch}`
      : `remotes/origin/${baseBranch}`;
    await git.raw(['worktree', 'add', '--track', '-b', userBranch, worktreePath, remoteBranch]);
  }

  return worktreePath;
}

/**
 * Creates a worktree with a new branch from HEAD.
 * The branch name will be prefixed with the user namespace for isolation.
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

  // Create a user-specific branch name
  const userBranch = createUserBranchName(userEmail, branch);

  const worktreePath = getWorktreePath(repoPath, userEmail, branch);

  // Check if worktree already exists
  if (await worktreeExists(repoPath, userEmail, branch)) {
    throw new Error(`Worktree already exists for branch: ${branch}`);
  }

  // Ensure parent directory exists
  await ensureWorktreesDir(repoPath, userEmail);

  const git = createGit(repoPath);

  // Check if user branch already exists locally
  const branches = await git.branch(['-a']);
  if (branches.all.includes(userBranch)) {
    throw new Error(`Branch already exists: ${branch}`);
  }

  // Create new user branch and worktree from HEAD
  console.log(`[Worktree] Creating new user branch '${userBranch}' from HEAD`);
  await git.raw(['worktree', 'add', '-b', userBranch, worktreePath]);

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
  const shortUserId = getShortUserId(userEmail);
  return path.join(repoPath, WORKTREES_DIR, shortUserId);
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
