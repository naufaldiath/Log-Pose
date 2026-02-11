import fs from 'fs';
import path from 'path';

/**
 * Audit logging service
 * Writes audit events to JSONL files
 */

type AuditEventType =
  | 'user_authenticated'
  | 'repo_opened'
  | 'file_read'
  | 'file_write'
  | 'file_delete'
  | 'search_query'
  | 'claude_session_start'
  | 'claude_session_end'
  | 'task_start'
  | 'task_end'
  | 'ws_connect'
  | 'ws_disconnect';

interface AuditEvent {
  timestamp: string;
  type: AuditEventType;
  userEmail: string;
  details: Record<string, unknown>;
}

class AuditLogger {
  private logDir: string;
  private stream: fs.WriteStream | null = null;
  private currentDate: string = '';
  
  constructor() {
    // Default log directory
    this.logDir = process.env.AUDIT_LOG_DIR || path.join(process.cwd(), 'logs', 'audit');
    
    // Ensure log directory exists
    fs.mkdirSync(this.logDir, { recursive: true });
  }
  
  /**
   * Gets or creates the log stream for today
   */
  private getStream(): fs.WriteStream {
    const today = new Date().toISOString().split('T')[0];
    
    if (this.stream && this.currentDate === today) {
      return this.stream;
    }
    
    // Close existing stream
    if (this.stream) {
      this.stream.end();
    }
    
    // Create new stream for today
    const logFile = path.join(this.logDir, `audit-${today}.jsonl`);
    this.stream = fs.createWriteStream(logFile, { flags: 'a' });
    this.currentDate = today;
    
    return this.stream;
  }
  
  /**
   * Logs an audit event
   */
  log(type: AuditEventType, userEmail: string, details: Record<string, unknown> = {}): void {
    const event: AuditEvent = {
      timestamp: new Date().toISOString(),
      type,
      userEmail,
      details,
    };
    
    try {
      const stream = this.getStream();
      stream.write(JSON.stringify(event) + '\n');
    } catch (error) {
      console.error('Failed to write audit log:', error);
    }
  }
  
  /**
   * Logs user authentication
   */
  logAuthentication(userEmail: string, success: boolean, method: string): void {
    this.log('user_authenticated', userEmail, { success, method });
  }
  
  /**
   * Logs repo access
   */
  logRepoOpened(userEmail: string, repoId: string): void {
    this.log('repo_opened', userEmail, { repoId });
  }
  
  /**
   * Logs file read
   */
  logFileRead(userEmail: string, repoId: string, filePath: string, size: number): void {
    this.log('file_read', userEmail, { repoId, filePath, size });
  }
  
  /**
   * Logs file write
   */
  logFileWrite(userEmail: string, repoId: string, filePath: string, size: number): void {
    this.log('file_write', userEmail, { repoId, filePath, size });
  }
  
  /**
   * Logs file delete
   */
  logFileDelete(userEmail: string, repoId: string, filePath: string): void {
    this.log('file_delete', userEmail, { repoId, filePath });
  }
  
  /**
   * Logs search query
   */
  logSearch(userEmail: string, repoId: string, query: string, resultCount: number): void {
    this.log('search_query', userEmail, { repoId, query: query.slice(0, 100), resultCount });
  }
  
  /**
   * Logs Claude session start
   */
  logClaudeSessionStart(userEmail: string, repoId: string, sessionId: string): void {
    this.log('claude_session_start', userEmail, { repoId, sessionId });
  }
  
  /**
   * Logs Claude session end
   */
  logClaudeSessionEnd(userEmail: string, repoId: string, sessionId: string, exitCode?: number): void {
    this.log('claude_session_end', userEmail, { repoId, sessionId, exitCode });
  }
  
  /**
   * Logs task start
   */
  logTaskStart(userEmail: string, repoId: string, taskId: string, runId: string): void {
    this.log('task_start', userEmail, { repoId, taskId, runId });
  }
  
  /**
   * Logs task end
   */
  logTaskEnd(
    userEmail: string,
    repoId: string,
    taskId: string,
    runId: string,
    state: string,
    exitCode?: number
  ): void {
    this.log('task_end', userEmail, { repoId, taskId, runId, state, exitCode });
  }
  
  /**
   * Logs WebSocket connection
   */
  logWsConnect(userEmail: string, repoId: string, clientId: string): void {
    this.log('ws_connect', userEmail, { repoId, clientId });
  }
  
  /**
   * Logs WebSocket disconnection
   */
  logWsDisconnect(userEmail: string, repoId: string, clientId: string): void {
    this.log('ws_disconnect', userEmail, { repoId, clientId });
  }
  
  /**
   * Closes the logger
   */
  close(): void {
    if (this.stream) {
      this.stream.end();
      this.stream = null;
    }
  }
}

export const auditLogger = new AuditLogger();
