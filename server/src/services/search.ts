import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import type { SearchMatch, SearchResponse } from '../types/index.js';
import { validateRelativePath } from '../utils/path-safety.js';

/**
 * Search service using ripgrep (rg)
 */

const MAX_RESULTS = 200;
const SEARCH_TIMEOUT = 30000; // 30 seconds

// File patterns to exclude
const EXCLUDE_PATTERNS = [
  'node_modules',
  '.git',
  '.svn',
  '__pycache__',
  'dist',
  'build',
  'coverage',
  '.next',
  'vendor',
  '*.min.js',
  '*.min.css',
  '*.map',
  '*.lock',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
];

/**
 * Searches for a pattern in the repository using ripgrep
 */
export async function searchRepo(
  repoPath: string,
  query: string,
  paths?: string[]
): Promise<SearchResponse> {
  // Build ripgrep arguments
  const args = [
    '--json',           // JSON output for easy parsing
    '--max-count=10',   // Max matches per file
    '--max-columns=300', // Truncate long lines
    '--max-filesize=1M', // Skip large files
    '--hidden',         // Search hidden files (but we exclude .git)
    '--follow',         // Follow symlinks
    '--smart-case',     // Case insensitive if all lowercase
  ];
  
  // Add exclusions
  for (const pattern of EXCLUDE_PATTERNS) {
    args.push('--glob', `!${pattern}`);
  }
  
  // Add the query
  args.push('--regexp', query);
  
  // Add search paths or default to repo root
  if (paths && paths.length > 0) {
    for (const p of paths) {
      // Validate path using centralized security function
      validateRelativePath(p);

      // Additional check for absolute paths
      if (path.isAbsolute(p)) {
        throw new Error('Absolute paths not allowed in search');
      }

      args.push(path.join(repoPath, p));
    }
  } else {
    args.push(repoPath);
  }
  
  return new Promise((resolve, reject) => {
    const matches: SearchMatch[] = [];
    let stderr = '';
    
    const rg: ChildProcess = spawn('rg', args, {
      cwd: repoPath,
      timeout: SEARCH_TIMEOUT,
    });
    
    let buffer = '';
    
    rg.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString();
      
      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line
      
      for (const line of lines) {
        if (!line.trim()) continue;
        if (matches.length >= MAX_RESULTS) continue;
        
        try {
          const parsed = JSON.parse(line);
          
          if (parsed.type === 'match' && parsed.data) {
            const match = parsed.data;
            const relativePath = path.relative(repoPath, match.path.text);
            
            matches.push({
              path: relativePath,
              line: match.line_number,
              text: match.lines.text.trim().slice(0, 300),
            });
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    });
    
    rg.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    
    rg.on('close', (code: number | null) => {
      // ripgrep returns 1 for no matches, 0 for matches, 2+ for errors
      if (code === 2) {
        reject(new Error(`Search failed: ${stderr}`));
      } else {
        resolve({ matches: matches.slice(0, MAX_RESULTS) });
      }
    });
    
    rg.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        reject(new Error('ripgrep (rg) is not installed. Please install it: brew install ripgrep'));
      } else {
        reject(error);
      }
    });
  });
}

/**
 * Checks if ripgrep is available
 */
export async function isRipgrepAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const rg = spawn('rg', ['--version']);
    rg.on('close', (code) => resolve(code === 0));
    rg.on('error', () => resolve(false));
  });
}
