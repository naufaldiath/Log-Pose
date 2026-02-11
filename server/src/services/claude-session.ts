import * as pty from 'node-pty';
import { spawn as cpSpawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { config } from '../utils/config.js';
import type { ClaudeSession, ServerMessage } from '../types/index.js';

/**
 * Claude PTY Session Manager
 * Manages multiple interactive Claude Code sessions per user/repo (tabs)
 */

// Buffer size for reconnect replay
const REPLAY_BUFFER_SIZE = 128 * 1024; // 128KB

interface SessionEntry {
  session: ClaudeSession;
  pty: pty.IPty | null;
  outputBuffer: string;
  clients: Set<SessionClient>;
  disconnectedAt?: Date;
  cleanupTimeout?: NodeJS.Timeout;
}

interface SessionClient {
  id: string;
  send: (message: ServerMessage) => void;
}

// Tab info for listing sessions
export interface TabInfo {
  id: string;
  name: string;
  state: ClaudeSession['state'];
  createdAt: Date;
}

class ClaudeSessionManager extends EventEmitter {
  private sessions = new Map<string, SessionEntry>(); // key: sessionId
  private userRepoSessions = new Map<string, Set<string>>(); // key: userEmail:repoId -> Set of sessionIds

  constructor() {
    super();

    // Periodic cleanup of disconnected sessions
    setInterval(() => this.cleanupExpiredSessions(), 60000);
  }

  /**
   * Gets the session key for a user/repo combination (for tab listing)
   */
  private getUserRepoKey(userEmail: string, repoId: string): string {
    return `${userEmail}:${repoId}`;
  }

  /**
   * Generates a unique session ID
   */
  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  /**
   * Generates a default tab name
   */
  private generateTabName(repoId: string, existingSessions: string[]): string {
    const count = existingSessions.length + 1;
    return `Session ${count}`;
  }

  /**
   * Creates a new session (tab) for a user/repo
   */
  async createSession(
    userEmail: string,
    repoId: string,
    repoPath: string,
    name?: string,
    cols?: number,
    rows?: number
  ): Promise<ClaudeSession> {
    // Check user session limit
    const userSessionCount = this.getUserSessionCount(userEmail);
    if (userSessionCount >= config.MAX_SESSIONS_PER_USER) {
      throw new Error(`Maximum sessions per user reached (${config.MAX_SESSIONS_PER_USER})`);
    }

    // Check total session limit
    if (this.sessions.size >= config.MAX_TOTAL_SESSIONS) {
      throw new Error(`Server at maximum capacity`);
    }

    const sessionId = this.generateSessionId();
    const userRepoKey = this.getUserRepoKey(userEmail, repoId);

    // Get existing sessions for this user/repo to generate name
    const existingSessionIds = this.userRepoSessions.get(userRepoKey) || new Set();
    const tabName = name || this.generateTabName(repoId, Array.from(existingSessionIds));

    // Create new session
    const session: ClaudeSession = {
      id: sessionId,
      userEmail,
      repoId,
      repoPath,
      name: tabName,
      state: 'starting',
      createdAt: new Date(),
      lastActivityAt: new Date(),
    };

    const entry: SessionEntry = {
      session,
      pty: null,
      outputBuffer: '',
      clients: new Set(),
    };

    this.sessions.set(sessionId, entry);

    // Track this session for the user/repo
    if (!this.userRepoSessions.has(userRepoKey)) {
      this.userRepoSessions.set(userRepoKey, new Set());
    }
    this.userRepoSessions.get(userRepoKey)!.add(sessionId);

    // Spawn Claude process
    await this.spawnClaude(entry, cols, rows);

    return session;
  }

  /**
   * Gets an existing session by ID
   */
  getSession(sessionId: string): ClaudeSession | null {
    const entry = this.sessions.get(sessionId);
    return entry?.session || null;
  }

  /**
   * Lists all sessions (tabs) for a user/repo
   */
  listSessions(userEmail: string, repoId: string): TabInfo[] {
    const userRepoKey = this.getUserRepoKey(userEmail, repoId);
    const sessionIds = this.userRepoSessions.get(userRepoKey);

    if (!sessionIds) {
      return [];
    }

    const tabs: TabInfo[] = [];
    for (const sessionId of sessionIds) {
      const entry = this.sessions.get(sessionId);
      if (entry) {
        tabs.push({
          id: entry.session.id,
          name: entry.session.name,
          state: entry.session.state,
          createdAt: entry.session.createdAt,
        });
      }
    }

    // Sort by creation time
    return tabs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  /**
   * Renames a session (tab)
   */
  renameSession(sessionId: string, newName: string): boolean {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      return false;
    }
    entry.session.name = newName;
    return true;
  }

  /**
   * Spawns the Claude process using child_process (node-pty not working)
   */
  private async spawnClaude(entry: SessionEntry, cols: number = 120, rows: number = 30): Promise<void> {
    const { session } = entry;

    try {
      // Spawn bash with node-pty, then exec Claude from within bash
      const ptyProcess = pty.spawn('/bin/bash', ['-c', `exec ${config.CLAUDE_PATH}`], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: session.repoPath,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          LANG: 'en_US.UTF-8',
          HOME: process.env.HOME,
        },
      });

      entry.pty = ptyProcess;
      session.state = 'running';

      // Handle PTY output
      ptyProcess.onData((data) => {
        // Add to replay buffer
        entry.outputBuffer += data;
        if (entry.outputBuffer.length > REPLAY_BUFFER_SIZE) {
          entry.outputBuffer = entry.outputBuffer.slice(-REPLAY_BUFFER_SIZE);
        }

        // Broadcast to all connected clients
        const message: ServerMessage = { type: 'output', data };
        for (const client of entry.clients) {
          try {
            client.send(message);
          } catch (error) {
            console.error('Failed to send to client:', error);
          }
        }

        session.lastActivityAt = new Date();
      });

      // Handle PTY exit
      ptyProcess.onExit(({ exitCode, signal }) => {
        session.state = 'exited';
        session.exitCode = exitCode;
        entry.pty = null;

        const message: ServerMessage = {
          type: 'status',
          state: 'exited',
          message: `Claude exited with code ${exitCode}${signal ? ` (signal: ${signal})` : ''}`,
        };

        for (const client of entry.clients) {
          try {
            client.send(message);
          } catch (error) {
            console.error('Failed to send exit status to client:', error);
          }
        }

        console.log(`Claude session ended: ${session.id}, exit code: ${exitCode}`);
      });

      // Send status to connected clients
      const statusMessage: ServerMessage = { type: 'status', state: 'running' };
      for (const client of entry.clients) {
        try {
          client.send(statusMessage);
        } catch (error) {
          console.error('Failed to send status to client:', error);
        }
      }

      console.log(`Claude session started: ${session.id}`);

    } catch (error) {
      console.error(`[ClaudeSession] Failed to spawn Claude:`, error);
      session.state = 'exited';
      session.exitCode = 1;
      throw error;
    }
  }

  /**
   * Attaches a client to a session
   */
  attachClient(
    sessionId: string,
    client: SessionClient
  ): { session: ClaudeSession; replay: string } | null {
    const entry = this.sessions.get(sessionId);

    if (!entry) {
      return null;
    }

    // Clear cleanup timeout if set
    if (entry.cleanupTimeout) {
      clearTimeout(entry.cleanupTimeout);
      entry.cleanupTimeout = undefined;
    }
    entry.disconnectedAt = undefined;

    entry.clients.add(client);
    entry.session.lastActivityAt = new Date();

    return {
      session: entry.session,
      replay: entry.outputBuffer,
    };
  }

  /**
   * Detaches a client from a session
   */
  detachClient(sessionId: string, clientId: string): void {
    const entry = this.sessions.get(sessionId);

    if (!entry) {
      return;
    }

    // Remove client
    for (const client of entry.clients) {
      if (client.id === clientId) {
        entry.clients.delete(client);
        break;
      }
    }

    // If no clients connected, start cleanup timer
    if (entry.clients.size === 0) {
      entry.disconnectedAt = new Date();
      entry.cleanupTimeout = setTimeout(() => {
        this.cleanupSession(sessionId);
      }, config.DISCONNECTED_TTL_MINUTES * 60 * 1000);
    }
  }

  /**
   * Sends input to the Claude process
   */
  sendInput(sessionId: string, data: string): boolean {
    const entry = this.sessions.get(sessionId);

    if (!entry || !entry.pty) {
      return false;
    }

    entry.pty.write(data);
    entry.session.lastActivityAt = new Date();
    return true;
  }

  /**
   * Resizes the terminal
   */
  resize(sessionId: string, cols: number, rows: number): boolean {
    const entry = this.sessions.get(sessionId);

    if (!entry || !entry.pty) {
      return false;
    }

    entry.pty.resize(cols, rows);
    return true;
  }

  /**
   * Restarts a session (kills existing Claude, starts new one)
   */
  async restartSession(sessionId: string): Promise<ClaudeSession | null> {
    const entry = this.sessions.get(sessionId);

    if (!entry) {
      return null;
    }

    // Kill existing PTY
    if (entry.pty) {
      entry.pty.kill();
      entry.pty = null;
    }

    // Clear buffer
    entry.outputBuffer = '';

    // Spawn new Claude
    await this.spawnClaude(entry);

    return entry.session;
  }

  /**
   * Terminates and removes a session
   */
  terminateSession(sessionId: string): boolean {
    return this.cleanupSession(sessionId);
  }

  /**
   * Cleans up a session
   */
  private cleanupSession(sessionId: string): boolean {
    const entry = this.sessions.get(sessionId);

    if (!entry) {
      return false;
    }

    // Kill PTY if running
    if (entry.pty) {
      entry.pty.kill();
    }

    // Clear timeout
    if (entry.cleanupTimeout) {
      clearTimeout(entry.cleanupTimeout);
    }

    // Notify clients
    const message: ServerMessage = {
      type: 'status',
      state: 'exited',
      message: 'Session terminated',
    };
    for (const client of entry.clients) {
      try {
        client.send(message);
      } catch {
        // Ignore send errors
      }
    }

    // Remove from user/repo tracking
    const userRepoKey = this.getUserRepoKey(entry.session.userEmail, entry.session.repoId);
    const userSessions = this.userRepoSessions.get(userRepoKey);
    if (userSessions) {
      userSessions.delete(sessionId);
      if (userSessions.size === 0) {
        this.userRepoSessions.delete(userRepoKey);
      }
    }

    this.sessions.delete(sessionId);

    return true;
  }

  /**
   * Cleans up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const ttlMs = config.DISCONNECTED_TTL_MINUTES * 60 * 1000;

    for (const [sessionId, entry] of this.sessions) {
      if (
        entry.disconnectedAt &&
        now - entry.disconnectedAt.getTime() > ttlMs
      ) {
        this.cleanupSession(sessionId);
      }
    }
  }

  /**
   * Gets the number of sessions for a user
   */
  private getUserSessionCount(userEmail: string): number {
    let count = 0;
    for (const entry of this.sessions.values()) {
      if (entry.session.userEmail === userEmail) {
        count++;
      }
    }
    return count;
  }

  /**
   * Gets all sessions for a user
   */
  getUserSessions(userEmail: string): ClaudeSession[] {
    const sessions: ClaudeSession[] = [];
    for (const entry of this.sessions.values()) {
      if (entry.session.userEmail === userEmail) {
        sessions.push(entry.session);
      }
    }
    return sessions;
  }

  /**
   * Gets stats
   */
  getStats(): {
    totalSessions: number;
    activeSessions: number;
    disconnectedSessions: number;
  } {
    let active = 0;
    let disconnected = 0;

    for (const entry of this.sessions.values()) {
      if (entry.disconnectedAt) {
        disconnected++;
      } else {
        active++;
      }
    }

    return {
      totalSessions: this.sessions.size,
      activeSessions: active,
      disconnectedSessions: disconnected,
    };
  }
}

// Export singleton instance
export const sessionManager = new ClaudeSessionManager();
