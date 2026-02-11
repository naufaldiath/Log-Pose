import fs from 'fs/promises';
import path from 'path';
import { config } from '../utils/config.js';
import type { RepoInfo } from '../types/index.js';

/**
 * Repository discovery and management service
 */

/**
 * Scans configured roots for repositories
 */
export async function discoverRepos(): Promise<RepoInfo[]> {
  const repos: RepoInfo[] = [];
  
  for (const root of config.REPO_ROOTS) {
    try {
      const entries = await fs.readdir(root, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const repoPath = path.join(root, entry.name);
          const repoId = path.relative(root, repoPath);
          
          // Check if it's a valid directory (could add .git check here)
          try {
            await fs.access(repoPath, fs.constants.R_OK);
            
            repos.push({
              repoId: `${path.basename(root)}/${entry.name}`,
              name: entry.name,
              pathHint: `${path.basename(root)}/${entry.name}`,
            });
          } catch {
            // Skip inaccessible directories
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to scan repo root: ${root}`, error);
    }
  }
  
  // Sort by name
  repos.sort((a, b) => a.name.localeCompare(b.name));
  
  return repos;
}

/**
 * Resolves a repoId to its absolute filesystem path
 * Returns null if the repo doesn't exist or is invalid
 */
export async function resolveRepoId(repoId: string): Promise<string | null> {
  // repoId format: "rootName/repoName"
  const parts = repoId.split('/');
  if (parts.length < 2) {
    return null;
  }
  
  const [rootName, ...restParts] = parts;
  const repoName = restParts.join('/');
  
  for (const root of config.REPO_ROOTS) {
    if (path.basename(root) === rootName) {
      const repoPath = path.join(root, repoName);
      
      try {
        const realPath = await fs.realpath(repoPath);
        const normalizedRoot = await fs.realpath(root);
        
        // Security: Ensure resolved path is under root
        if (!realPath.startsWith(normalizedRoot)) {
          console.warn(`Repo path escapes root: ${repoId}`);
          return null;
        }
        
        const stats = await fs.stat(realPath);
        if (stats.isDirectory()) {
          return realPath;
        }
      } catch {
        // Path doesn't exist or isn't accessible
      }
    }
  }
  
  return null;
}

/**
 * Gets info for a specific repo
 */
export async function getRepoInfo(repoId: string): Promise<RepoInfo | null> {
  const repoPath = await resolveRepoId(repoId);
  if (!repoPath) {
    return null;
  }
  
  return {
    repoId,
    name: path.basename(repoPath),
    pathHint: repoId,
  };
}
