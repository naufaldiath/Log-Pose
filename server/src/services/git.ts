import { simpleGit, SimpleGit, SimpleGitOptions } from 'simple-git';
import type { GitStatus, GitCommit } from '../types/index.js';

/**
 * Git service - safe wrappers for common git operations
 */

// Create a git instance with safety options
function createGit(repoPath: string): SimpleGit {
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
