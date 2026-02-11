import { z } from 'zod';

// Environment configuration schema
export const configSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('127.0.0.1'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Repository roots (comma-separated paths)
  REPO_ROOTS: z.string().transform(s => s.split(',').map(p => p.trim()).filter(Boolean)),
  
  // Allowlisted emails (comma-separated)
  ALLOWLIST_EMAILS: z.string().transform(s => s.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)),
  
  // Cloudflare Access settings
  CF_ACCESS_TEAM_DOMAIN: z.string().optional(),
  CF_ACCESS_AUD: z.string().optional(),
  
  // Session limits
  MAX_SESSIONS_PER_USER: z.coerce.number().default(3),
  MAX_TOTAL_SESSIONS: z.coerce.number().default(20),
  DISCONNECTED_TTL_MINUTES: z.coerce.number().default(20),
  
  // File limits
  MAX_FILE_SIZE_BYTES: z.coerce.number().default(2_000_000),
  
  // Task runner
  TASKS_ENABLED: z.coerce.boolean().default(true),
  
  // Claude settings
  CLAUDE_PATH: z.string().default('claude'),
});

export type Config = z.infer<typeof configSchema>;

// Request context types
export interface AuthenticatedUser {
  email: string;
  displayName?: string;
}

// API response types
export interface RepoInfo {
  repoId: string;
  name: string;
  pathHint: string;
}

export interface FileEntry {
  name: string;
  type: 'file' | 'dir';
}

export interface TreeResponse {
  path: string;
  entries: FileEntry[];
}

export interface FileResponse {
  path: string;
  content: string;
}

export interface FileWriteResponse {
  ok: boolean;
  bytesWritten: number;
}

export interface SearchMatch {
  path: string;
  line: number;
  text: string;
}

export interface SearchResponse {
  matches: SearchMatch[];
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  modified: string[];
  untracked: string[];
}

export interface GitCommit {
  hash: string;
  author: string;
  date: string;
  message: string;
}

// WebSocket message types
export type ClientMessage =
  | { type: 'attach'; sessionId?: string; cols?: number; rows?: number }
  | { type: 'input'; data: string }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'ping' }
  | { type: 'restart' };

export type ServerMessage =
  | { type: 'output'; data: string }
  | { type: 'status'; state: 'starting' | 'running' | 'exited'; message?: string; sessionId?: string; sessionName?: string }
  | { type: 'pong' }
  | { type: 'replay'; data: string }
  | { type: 'error'; message: string };

// Session types
export interface ClaudeSession {
  id: string;
  userEmail: string;
  repoId: string;
  repoPath: string;
  name: string; // Tab name
  state: 'starting' | 'running' | 'exited';
  createdAt: Date;
  lastActivityAt: Date;
  exitCode?: number;
}

// Tab info for API responses
export interface TabInfo {
  id: string;
  name: string;
  state: ClaudeSession['state'];
  createdAt: Date;
}

// Task types
export interface TaskDefinition {
  command: string[];
  timeout?: number;
}

export interface TaskConfig {
  tasks: Record<string, string[]>;
}

export interface TaskRun {
  runId: string;
  repoId: string;
  taskId: string;
  state: 'running' | 'completed' | 'failed' | 'stopped';
  exitCode?: number;
  startedAt: Date;
  endedAt?: Date;
}
