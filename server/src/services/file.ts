import fs from 'fs/promises';
import path from 'path';
import { config } from '../utils/config.js';
import { resolveFilePath, PathSecurityError } from '../utils/path-safety.js';
import type { TreeResponse, FileEntry, FileResponse, FileWriteResponse } from '../types/index.js';

/**
 * File system service for reading/writing files and directory listing
 */

// Binary file extensions to skip
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.bmp', '.tiff',
  '.mp3', '.mp4', '.wav', '.ogg', '.webm', '.avi', '.mov',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.exe', '.dll', '.so', '.dylib',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.sqlite', '.db',
]);

// Directories to skip
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '__pycache__',
  '.cache',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  'vendor',
  'target',
]);

/**
 * Lists directory contents
 */
export async function listDirectory(repoPath: string, relativePath: string): Promise<TreeResponse> {
  const dirPath = relativePath === '' || relativePath === '.' 
    ? repoPath 
    : await resolveFilePath(repoPath, relativePath);
  
  const entries: FileEntry[] = [];
  
  try {
    const dirEntries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of dirEntries) {
      // Skip hidden files (except specific ones)
      if (entry.name.startsWith('.') && !['package.json', '.env.example'].includes(entry.name)) {
        // Allow .gitignore, .eslintrc, etc.
        if (!entry.name.match(/^\.(gitignore|eslintrc|prettierrc|editorconfig|env\.example)/)) {
          continue;
        }
      }
      
      // Skip large directories
      if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) {
        continue;
      }
      
      entries.push({
        name: entry.name,
        type: entry.isDirectory() ? 'dir' : 'file',
      });
    }
    
    // Sort: directories first, then files, alphabetically
    entries.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'dir' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new PathSecurityError(`Directory not found: ${relativePath}`);
    }
    if (error.code === 'ENOTDIR') {
      throw new PathSecurityError(`Not a directory: ${relativePath}`);
    }
    throw error;
  }
  
  return {
    path: relativePath || '.',
    entries,
  };
}

/**
 * Reads a file's content
 */
export async function readFile(repoPath: string, relativePath: string): Promise<FileResponse> {
  const filePath = await resolveFilePath(repoPath, relativePath);
  
  // Check file extension
  const ext = path.extname(relativePath).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) {
    throw new PathSecurityError(`Binary files are not supported: ${relativePath}`);
  }
  
  try {
    const stats = await fs.stat(filePath);
    
    // Check file size
    if (stats.size > config.MAX_FILE_SIZE_BYTES) {
      throw new PathSecurityError(
        `File too large: ${stats.size} bytes (max: ${config.MAX_FILE_SIZE_BYTES})`
      );
    }
    
    if (!stats.isFile()) {
      throw new PathSecurityError(`Not a file: ${relativePath}`);
    }
    
    const content = await fs.readFile(filePath, 'utf-8');
    
    return {
      path: relativePath,
      content,
    };
    
  } catch (error: any) {
    if (error instanceof PathSecurityError) {
      throw error;
    }
    if (error.code === 'ENOENT') {
      throw new PathSecurityError(`File not found: ${relativePath}`);
    }
    throw error;
  }
}

/**
 * Writes content to a file
 */
export async function writeFile(
  repoPath: string,
  relativePath: string,
  content: string
): Promise<FileWriteResponse> {
  // Check content size
  const contentBytes = Buffer.byteLength(content, 'utf-8');
  if (contentBytes > config.MAX_FILE_SIZE_BYTES) {
    throw new PathSecurityError(
      `Content too large: ${contentBytes} bytes (max: ${config.MAX_FILE_SIZE_BYTES})`
    );
  }
  
  const filePath = await resolveFilePath(repoPath, relativePath);
  
  try {
    // Ensure parent directory exists
    const parentDir = path.dirname(filePath);
    await fs.mkdir(parentDir, { recursive: true });
    
    await fs.writeFile(filePath, content, 'utf-8');
    
    return {
      ok: true,
      bytesWritten: contentBytes,
    };
    
  } catch (error: any) {
    if (error instanceof PathSecurityError) {
      throw error;
    }
    throw new Error(`Failed to write file: ${error.message}`);
  }
}

/**
 * Checks if a file exists
 */
export async function fileExists(repoPath: string, relativePath: string): Promise<boolean> {
  try {
    const filePath = await resolveFilePath(repoPath, relativePath);
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Deletes a file
 */
export async function deleteFile(repoPath: string, relativePath: string): Promise<void> {
  const filePath = await resolveFilePath(repoPath, relativePath);
  
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      throw new PathSecurityError(`Not a file: ${relativePath}`);
    }
    
    await fs.unlink(filePath);
  } catch (error: any) {
    if (error instanceof PathSecurityError) {
      throw error;
    }
    if (error.code === 'ENOENT') {
      throw new PathSecurityError(`File not found: ${relativePath}`);
    }
    throw error;
  }
}
