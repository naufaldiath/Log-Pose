import { simpleGit, SimpleGit, SimpleGitOptions } from 'simple-git';
import type { GitStatus, GitCommit } from '../types/index.js';

/**
 * Git service - safe wrappers for common git operations
 */

// Create a git instance with safety options
export function createGit(repoPath: string): SimpleGit {
  const options: Partial<SimpleGitOptions> = {
    baseDir: repoPath,
    binary: 'git',
    maxConcurrentProcesses: 1,
    trimmed: true,
  };
  
  return simpleGit(options);
}

/**
 * Gets the current git status
 */
export async function getStatus(repoPath: string): Promise<GitStatus> {
  const git = createGit(repoPath);
  
  const [status, branchInfo] = await Promise.all([
    git.status(),
    git.branch(),
  ]);
  
  return {
    branch: status.current || 'unknown',
    ahead: status.ahead,
    behind: status.behind,
    staged: status.staged,
    modified: status.modified,
    untracked: status.not_added,
  };
}

/**
 * Gets the diff for a specific file or all files
 */
export async function getDiff(repoPath: string, filePath?: string): Promise<string> {
  const git = createGit(repoPath);
  
  if (filePath) {
    // Validate path doesn't contain dangerous characters
    if (filePath.includes('..') || filePath.startsWith('/')) {
      throw new Error('Invalid file path');
    }
    return git.diff(['--', filePath]);
  }
  
  return git.diff();
}

/**
 * Gets staged diff
 */
export async function getStagedDiff(repoPath: string): Promise<string> {
  const git = createGit(repoPath);
  return git.diff(['--cached']);
}

/**
 * Gets recent commits
 */
export async function getLog(repoPath: string, limit = 50): Promise<GitCommit[]> {
  const git = createGit(repoPath);
  
  const log = await git.log({
    maxCount: Math.min(limit, 100), // Cap at 100
    format: {
      hash: '%H',
      author: '%an',
      date: '%aI',
      message: '%s',
    },
  });
  
  return log.all.map((entry) => ({
    hash: entry.hash,
    author: entry.author,
    date: entry.date,
    message: entry.message,
  }));
}

/**
 * Gets diff for a specific commit
 */
export async function getCommitDiff(repoPath: string, commitHash: string): Promise<string> {
  const git = createGit(repoPath);
  
  // Validate commit hash format (only alphanumeric)
  if (!/^[a-f0-9]{7,40}$/i.test(commitHash)) {
    throw new Error('Invalid commit hash');
  }
  
  return git.show([commitHash, '--format=']);
}

/**
 * Gets the content of a file at a specific commit
 */
export async function getFileAtCommit(
  repoPath: string,
  commitHash: string,
  filePath: string
): Promise<string> {
  const git = createGit(repoPath);
  
  // Validate inputs
  if (!/^[a-f0-9]{7,40}$/i.test(commitHash)) {
    throw new Error('Invalid commit hash');
  }
  if (filePath.includes('..') || filePath.startsWith('/')) {
    throw new Error('Invalid file path');
  }
  
  return git.show([`${commitHash}:${filePath}`]);
}

/**
 * Checks if a directory is a git repository
 */
export async function isGitRepository(repoPath: string): Promise<boolean> {
  try {
    const git = createGit(repoPath);
    await git.status();
    return true;
  } catch {
    return false;
  }
}

/**
 * Gets branches list
 */
export async function getBranches(repoPath: string): Promise<{
  current: string;
  all: string[];
}> {
  const git = createGit(repoPath);
  const result = await git.branch();

  return {
    current: result.current,
    all: result.all.filter((b) => !b.startsWith('remotes/')),
  };
}

// Worktree types
export interface WorktreeInfo {
  path: string;
  branch: string;
  commit: string;
  isDetached: boolean;
  isMain: boolean;
}

/**
 * Creates a git worktree
 */
export async function createWorktree(
  repoPath: string,
  worktreePath: string,
  branch: string,
  createBranch = false
): Promise<void> {
  const git = createGit(repoPath);

  const args = ['worktree', 'add'];
  if (createBranch) {
    args.push('-b', branch);
  } else {
    args.push('-B', branch); // Force create/reset branch
  }
  args.push(worktreePath);

  await git.raw(args);
}

/**
 * Lists all worktrees with detailed information
 */
export async function worktreeList(repoPath: string): Promise<WorktreeInfo[]> {
  const git = createGit(repoPath);

  try {
    const result = await git.raw(['worktree', 'list', '--porcelain']);
    const worktrees: WorktreeInfo[] = [];

    const lines = result.split('\n');
    let current: Partial<WorktreeInfo> = {};

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        if (current.path) {
          worktrees.push(current as WorktreeInfo);
        }
        current = {
          path: line.slice(9),
          branch: '',
          commit: '',
          isDetached: false,
          isMain: false,
        };
      } else if (line.startsWith('branch ')) {
        current.branch = line.slice(7).replace('refs/heads/', '');
      } else if (line.startsWith('HEAD ')) {
        current.commit = line.slice(5);
      } else if (line === 'detached') {
        current.isDetached = true;
      } else if (line === 'bare') {
        // Skip bare entries
      }
    }

    if (current.path) {
      worktrees.push(current as WorktreeInfo);
    }

    // Mark the first worktree as main (usually the original repo)
    if (worktrees.length > 0) {
      worktrees[0].isMain = true;
    }

    return worktrees;
  } catch (error) {
    console.error('[Git] Error listing worktrees:', error);
    return [];
  }
}

/**
 * Removes a worktree
 */
export async function removeWorktree(
  repoPath: string,
  worktreePath: string,
  force = false
): Promise<void> {
  const git = createGit(repoPath);

  const args = ['worktree', 'remove'];
  if (force) {
    args.push('--force');
  }
  args.push(worktreePath);

  await git.raw(args);
}

/**
 * Prunes stale worktree entries
 */
export async function pruneWorktrees(repoPath: string): Promise<void> {
  const git = createGit(repoPath);
  await git.raw(['worktree', 'prune']);
}

/**
 * Checks if a branch exists locally or remotely
 */
export async function branchExists(repoPath: string, branch: string): Promise<boolean> {
  const git = createGit(repoPath);

  try {
    const result = await git.branch(['-a']);
    return result.all.some(
      (b) => b === branch || b === `origin/${branch}` || b === `remotes/origin/${branch}`
    );
  } catch {
    return false;
  }
}

/**
 * Creates a new branch from HEAD
 */
export async function createBranch(repoPath: string, branch: string): Promise<void> {
  const git = createGit(repoPath);
  await git.checkoutLocalBranch(branch);
}
