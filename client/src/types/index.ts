// API Types - matching backend types

export interface User {
  email: string;
  displayName?: string;
}

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

// Terminal Tab types
export interface TerminalTab {
  id: string;
  name: string;
  state: SessionState;
  createdAt: string;
}

export interface TerminalSession {
  id: string;
  name: string;
  state: SessionState;
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
  | { type: 'status'; state: SessionState; message?: string; sessionId?: string; sessionName?: string }
  | { type: 'pong' }
  | { type: 'replay'; data: string }
  | { type: 'error'; message: string };

export type SessionState = 'starting' | 'running' | 'exited';

// User session for session manager (cross-repo)
export interface UserSession {
  id: string;
  repoId: string;
  repoName: string;
  name: string;
  state: SessionState;
  createdAt: string;
}

// UI State types
export interface OpenFile {
  path: string;
  content: string;
  isDirty: boolean;
  language?: string;
}

export interface TaskInfo {
  runId: string;
  taskId: string;
  state: 'running' | 'completed' | 'failed' | 'stopped';
}
