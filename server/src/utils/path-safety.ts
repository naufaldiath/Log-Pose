import path from 'path';
import fs from 'fs/promises';
import { config } from './config.js';

/**
 * Path safety utilities - prevents directory traversal and symlink escapes
 */

export class PathSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathSecurityError';
  }
}

/**
 * Validates a relative path:
 * - Must not be absolute
 * - Must not contain '..' traversal
 * - Must not start with '/'
 */
export function validateRelativePath(relativePath: string): void {
  if (!relativePath) {
    throw new PathSecurityError('Path cannot be empty');
  }
  
  if (path.isAbsolute(relativePath)) {
    throw new PathSecurityError('Absolute paths are not allowed');
  }
  
  const normalized = path.normalize(relativePath);
  
  if (normalized.startsWith('..') || normalized.includes('/..') || normalized.includes('\\..')) {
    throw new PathSecurityError('Path traversal (..) is not allowed');
  }
  
  if (normalized.startsWith('/') || normalized.startsWith('\\')) {
    throw new PathSecurityError('Path cannot start with a separator');
  }
}

/**
 * Resolves a repo ID to its absolute path
 */
export function resolveRepoPath(repoId: string): string {
  validateRelativePath(repoId);
  
  for (const root of config.REPO_ROOTS) {
    const candidate = path.join(root, repoId);
    const normalizedCandidate = path.normalize(candidate);
    const normalizedRoot = path.normalize(root);
    
    // Ensure the resolved path is still under the root
    if (normalizedCandidate.startsWith(normalizedRoot)) {
      return normalizedCandidate;
    }
  }
  
  throw new PathSecurityError(`Repository not found: ${repoId}`);
}

/**
 * Resolves a file path within a repo and validates it stays within bounds
 */
export async function resolveFilePath(repoPath: string, relativePath: string): Promise<string> {
  validateRelativePath(relativePath);
  
  const candidatePath = path.join(repoPath, relativePath);
  
  // Resolve symlinks to get the real path
  let realPath: string;
  try {
    realPath = await fs.realpath(candidatePath);
  } catch (error: any) {
    // If file doesn't exist, check the parent directory
    if (error.code === 'ENOENT') {
      const parentDir = path.dirname(candidatePath);
      try {
        const realParent = await fs.realpath(parentDir);
        realPath = path.join(realParent, path.basename(candidatePath));
      } catch {
        throw new PathSecurityError(`Path does not exist: ${relativePath}`);
      }
    } else {
      throw error;
    }
  }
  
  // Ensure the real path is still under the repo
  const normalizedRepo = path.normalize(repoPath);
  const normalizedReal = path.normalize(realPath);
  
  if (!normalizedReal.startsWith(normalizedRepo)) {
    throw new PathSecurityError('Path escapes repository boundary (symlink detected)');
  }
  
  return realPath;
}

/**
 * Validates that a repo exists and returns its info
 */
export async function validateRepoExists(repoPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(repoPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Checks if a path is a git repository
 */
export async function isGitRepo(repoPath: string): Promise<boolean> {
  try {
    const gitDir = path.join(repoPath, '.git');
    const stats = await fs.stat(gitDir);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Sanitizes a filename (removes dangerous characters)
 */
export function sanitizeFilename(filename: string): string {
  return filename.replace(/[<>:"/\\|?*\x00-\x1f]/g, '');
}

/**
 * Gets the relative path from repo root
 */
export function getRelativePath(repoPath: string, absolutePath: string): string {
  return path.relative(repoPath, absolutePath);
}
