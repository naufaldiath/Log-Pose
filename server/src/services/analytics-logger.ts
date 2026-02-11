import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../utils/config.js';
import type {
  AnalyticsEvent,
  AnalyticsEventType,
  AnalyticsConfig,
  AnalyticsQuery,
  AnalyticsSummary,
  TimeSeriesDataPoint,
  FeatureAdoptionMetrics,
  PerformanceMetrics,
  UserActivitySummary,
  UserDetail,
} from '../types/analytics.js';

/**
 * Analytics logging service
 * Writes product analytics events to JSONL files
 * Modeled after audit-logger.ts but focused on user behavior and performance
 */

class AnalyticsLogger {
  private logDir: string = '';
  private stream: fs.WriteStream | null = null;
  private currentDate: string = '';
  private config: AnalyticsConfig;
  private sessionIds = new Map<string, string>(); // userEmail -> sessionId

  constructor() {
    // Default configuration
    this.config = {
      enabled: process.env.ANALYTICS_ENABLED !== 'false', // Enabled by default
      logDir: process.env.ANALYTICS_LOG_DIR || path.join(process.cwd(), 'logs', 'analytics'),
      retentionDays: parseInt(process.env.ANALYTICS_RETENTION_DAYS || '90', 10),
      hashUserIds: true,
    };

    this.logDir = this.config.logDir;

    // Ensure log directory exists if analytics is enabled
    if (this.config.enabled) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Gets or creates the log stream for today
   */
  private getStream(): fs.WriteStream | null {
    if (!this.config.enabled) {
      return null;
    }

    const today = new Date().toISOString().split('T')[0];

    if (this.stream && this.currentDate === today) {
      return this.stream;
    }

    // Close existing stream
    if (this.stream) {
      this.stream.end();
    }

    // Create new stream for today
    const logFile = path.join(this.logDir, `analytics-${today}.jsonl`);
    this.stream = fs.createWriteStream(logFile, { flags: 'a' });
    this.currentDate = today;

    return this.stream;
  }

  /**
   * Generates a hash of the user email for privacy
   */
  private hashUserId(email: string): string {
    if (!this.config.hashUserIds) {
      return email;
    }
    // Use a simple hash with a daily salt for privacy
    const salt = new Date().toISOString().split('T')[0];
    return crypto
      .createHash('sha256')
      .update(email + salt)
      .digest('hex')
      .slice(0, 16);
  }

  /**
   * Gets or creates a session ID for a user
   */
  private getSessionId(userEmail: string): string {
    if (!this.sessionIds.has(userEmail)) {
      const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      this.sessionIds.set(userEmail, sessionId);
    }
    return this.sessionIds.get(userEmail)!;
  }

  /**
   * Clears the session ID for a user (called on logout/app unload)
   */
  clearSession(userEmail: string): void {
    this.sessionIds.delete(userEmail);
  }

  /**
   * Logs an analytics event
   */
  log(
    eventType: AnalyticsEventType,
    userEmail: string,
    properties: Record<string, unknown> = {}
  ): void {
    if (!this.config.enabled) {
      return;
    }

    const event: AnalyticsEvent = {
      timestamp: new Date().toISOString(),
      event: eventType,
      userId: this.hashUserId(userEmail),
      userEmail: userEmail, // Store email for admin dashboard display
      sessionId: this.getSessionId(userEmail),
      properties,
    };

    try {
      const stream = this.getStream();
      if (stream) {
        stream.write(JSON.stringify(event) + '\n');
      }
    } catch (error) {
      // Fail silently - analytics should never break the app
      console.error('Failed to write analytics log:', error);
    }
  }

  /**
   * Logs an API request with timing
   */
  logApiRequest(
    userEmail: string,
    endpoint: string,
    method: string,
    durationMs: number,
    statusCode: number
  ): void {
    this.log('api_request', userEmail, {
      endpoint,
      method,
      durationMs,
      statusCode,
    });
  }

  /**
   * Logs an API error
   */
  logApiError(
    userEmail: string,
    endpoint: string,
    statusCode: number,
    errorType: string
  ): void {
    this.log('api_error', userEmail, {
      endpoint,
      statusCode,
      errorType,
    });
  }

  /**
   * Logs a file opened event
   */
  logFileOpened(
    userEmail: string,
    repoId: string,
    filePath: string,
    fileSize: number,
    loadTimeMs: number
  ): void {
    const fileExtension = path.extname(filePath).slice(1) || 'no-ext';
    this.log('file_opened', userEmail, {
      repoId,
      fileExtension,
      fileSize,
      loadTimeMs,
    });
  }

  /**
   * Logs a file saved event
   */
  logFileSaved(
    userEmail: string,
    repoId: string,
    filePath: string,
    fileSize: number,
    durationMs: number
  ): void {
    const fileExtension = path.extname(filePath).slice(1) || 'no-ext';
    this.log('file_saved', userEmail, {
      repoId,
      fileExtension,
      fileSize,
      durationMs,
    });
  }

  /**
   * Logs a file deleted event
   */
  logFileDeleted(userEmail: string, repoId: string, filePath: string, isFolder: boolean): void {
    this.log('file_deleted', userEmail, {
      repoId,
      isFolder,
    });
  }

  /**
   * Logs a file created event
   */
  logFileCreated(userEmail: string, repoId: string, filePath: string, isFolder: boolean): void {
    this.log('file_created', userEmail, {
      repoId,
      isFolder,
    });
  }

  /**
   * Logs a search performed event
   */
  logSearchPerformed(
    userEmail: string,
    repoId: string,
    resultCount: number,
    durationMs: number,
    hasRegex: boolean = false,
    hasFilters: boolean = false
  ): void {
    this.log('search_performed', userEmail, {
      repoId,
      resultCount,
      durationMs,
      hasRegex,
      hasFilters,
    });
  }

  /**
   * Logs a repository selection event
   */
  logRepoSelected(userEmail: string, repoId: string, previousRepoId?: string): void {
    this.log('repo_selected', userEmail, {
      repoId,
      previousRepoId,
    });
  }

  /**
   * Logs a terminal tab created event
   */
  logTerminalTabCreated(
    userEmail: string,
    repoId: string,
    sessionId: string,
    isFirstTab: boolean
  ): void {
    this.log('terminal_tab_created', userEmail, {
      repoId,
      sessionId,
      isFirstTab,
    });
  }

  /**
   * Logs a terminal connected event
   */
  logTerminalConnected(userEmail: string, repoId: string, connectTimeMs: number): void {
    this.log('terminal_connected', userEmail, {
      repoId,
      connectTimeMs,
    });
  }

  /**
   * Logs a terminal disconnected event
   */
  logTerminalDisconnected(
    userEmail: string,
    repoId: string,
    durationMs: number,
    reason?: string
  ): void {
    this.log('terminal_disconnected', userEmail, {
      repoId,
      durationMs,
      reason,
    });
  }

  /**
   * Logs a terminal max sessions error
   */
  logTerminalMaxSessions(userEmail: string, repoId: string, currentSessionCount: number): void {
    this.log('terminal_max_sessions', userEmail, {
      repoId,
      currentSessionCount,
    });
  }

  /**
   * Logs a terminal restarted event
   */
  logTerminalRestarted(userEmail: string, repoId: string, sessionId: string): void {
    this.log('terminal_restarted', userEmail, {
      repoId,
      sessionId,
    });
  }

  /**
   * Logs a task started event
   */
  logTaskStarted(userEmail: string, repoId: string, taskId: string, runId: string): void {
    this.log('task_started', userEmail, {
      repoId,
      taskId,
      runId,
    });
  }

  /**
   * Logs a task completed event
   */
  logTaskCompleted(
    userEmail: string,
    repoId: string,
    taskId: string,
    runId: string,
    durationMs: number,
    exitCode?: number
  ): void {
    this.log('task_completed', userEmail, {
      repoId,
      taskId,
      runId,
      durationMs,
      exitCode,
    });
  }

  /**
   * Logs a file tree loaded event
   */
  logFileTreeLoaded(userEmail: string, repoId: string, entryCount: number, durationMs: number): void {
    this.log('file_tree_loaded', userEmail, {
      repoId,
      entryCount,
      durationMs,
    });
  }

  /**
   * Logs a WebSocket error
   */
  logWebSocketError(userEmail: string, repoId: string, errorType: string): void {
    this.log('websocket_error', userEmail, {
      repoId,
      errorType,
    });
  }

  /**
   * Logs a file operation error
   */
  logFileOperationError(
    userEmail: string,
    repoId: string,
    operation: string,
    errorType: string
  ): void {
    this.log('file_operation_error', userEmail, {
      repoId,
      operation,
      errorType,
    });
  }

  /**
   * Logs a path security violation
   */
  logPathSecurityViolation(userEmail: string, attemptedPath: string, operation: string): void {
    this.log('path_security_violation', userEmail, {
      attemptedPath,
      operation,
    });
  }

  /**
   * Logs a session manager opened event
   */
  logSessionManagerOpened(userEmail: string, repoCount: number, totalSessions: number): void {
    this.log('session_manager_opened', userEmail, {
      repoCount,
      totalSessions,
    });
  }

  /**
   * Logs a session deleted event
   */
  logSessionDeleted(userEmail: string, repoId: string, sessionAgeMs: number): void {
    this.log('session_deleted', userEmail, {
      repoId,
      sessionAgeMs,
    });
  }

  /**
   * Logs a git status viewed event
   */
  logGitStatusViewed(userEmail: string, repoId: string): void {
    this.log('git_status_viewed', userEmail, {
      repoId,
    });
  }

  /**
   * Logs a git diff viewed event
   */
  logGitDiffViewed(userEmail: string, repoId: string, fileCount: number): void {
    this.log('git_diff_viewed', userEmail, {
      repoId,
      fileCount,
    });
  }

  /**
   * Logs a git log viewed event
   */
  logGitLogViewed(userEmail: string, repoId: string): void {
    this.log('git_log_viewed', userEmail, {
      repoId,
    });
  }

  /**
   * Reads analytics events from log files
   */
  async queryEvents(query: AnalyticsQuery = {}): Promise<AnalyticsEvent[]> {
    const events: AnalyticsEvent[] = [];
    const files = fs.readdirSync(this.logDir).filter(f => f.startsWith('analytics-') && f.endsWith('.jsonl'));

    // Sort files by date (newest first)
    files.sort().reverse();

    for (const file of files) {
      // Extract date from filename (analytics-YYYY-MM-DD.jsonl)
      const fileDate = file.slice(10, 20);

      // Skip files outside date range
      if (query.startDate && fileDate < query.startDate.toISOString().split('T')[0]) {
        continue;
      }
      if (query.endDate && fileDate > query.endDate.toISOString().split('T')[0]) {
        continue;
      }

      const filePath = path.join(this.logDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const event = JSON.parse(line) as AnalyticsEvent;

          // Apply filters
          if (query.eventTypes && !query.eventTypes.includes(event.event)) {
            continue;
          }
          if (query.userId && event.userId !== query.userId) {
            continue;
          }
          if (query.repoId && event.properties.repoId !== query.repoId) {
            continue;
          }

          events.push(event);

          // Apply limit
          if (query.limit && events.length >= query.limit) {
            return events;
          }
        } catch {
          // Skip invalid lines
          continue;
        }
      }
    }

    return events;
  }

  /**
   * Gets summary statistics for analytics
   */
  async getSummary(startDate?: Date, endDate?: Date): Promise<AnalyticsSummary> {
    const events = await this.queryEvents({ startDate, endDate });

    const uniqueUsers = new Set(events.map(e => e.userId));
    const eventsByType: Record<string, number> = {};
    const eventsByDay: Record<string, number> = {};

    for (const event of events) {
      // Count by type
      eventsByType[event.event] = (eventsByType[event.event] || 0) + 1;

      // Count by day
      const day = event.timestamp.split('T')[0];
      eventsByDay[day] = (eventsByDay[day] || 0) + 1;
    }

    return {
      totalEvents: events.length,
      uniqueUsers: uniqueUsers.size,
      eventsByType,
      eventsByDay,
    };
  }

  /**
   * Gets time series data for events
   */
  async getTimeSeries(
    eventTypes: AnalyticsEventType[],
    days: number = 30
  ): Promise<TimeSeriesDataPoint[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const events = await this.queryEvents({
      startDate,
      endDate,
      eventTypes,
    });

    const counts: Record<string, number> = {};

    // Initialize all days with 0
    for (let i = 0; i <= days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      counts[d.toISOString().split('T')[0]] = 0;
    }

    // Count events by day
    for (const event of events) {
      const day = event.timestamp.split('T')[0];
      counts[day] = (counts[day] || 0) + 1;
    }

    // Convert to array and sort by date
    return Object.entries(counts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Gets feature adoption metrics
   */
  async getFeatureAdoption(days: number = 30): Promise<FeatureAdoptionMetrics> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const events = await this.queryEvents({ startDate, endDate });

    const terminalUsers = new Set<string>();
    const searchUsers = new Set<string>();
    const mobileUsers = new Set<string>();
    const gitFeatureUsers = new Set<string>();
    const taskRunnerUsers = new Set<string>();

    for (const event of events) {
      switch (event.event) {
        case 'terminal_connected':
          terminalUsers.add(event.userId);
          break;
        case 'search_performed':
          searchUsers.add(event.userId);
          break;
        case 'mobile_keybar_used':
          mobileUsers.add(event.userId);
          break;
        case 'git_status_viewed':
        case 'git_diff_viewed':
        case 'git_log_viewed':
          gitFeatureUsers.add(event.userId);
          break;
        case 'task_started':
          taskRunnerUsers.add(event.userId);
          break;
      }
    }

    return {
      terminalUsers: terminalUsers.size,
      searchUsers: searchUsers.size,
      mobileUsers: mobileUsers.size,
      gitFeatureUsers: gitFeatureUsers.size,
      taskRunnerUsers: taskRunnerUsers.size,
    };
  }

  /**
   * Gets performance metrics
   */
  async getPerformanceMetrics(days: number = 7): Promise<PerformanceMetrics> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const events = await this.queryEvents({
      startDate,
      endDate,
      eventTypes: ['api_request', 'file_opened'],
    });

    const apiTimes: number[] = [];
    const fileLoadTimes: number[] = [];

    for (const event of events) {
      if (event.event === 'api_request' && typeof event.properties.durationMs === 'number') {
        apiTimes.push(event.properties.durationMs);
      } else if (event.event === 'file_opened' && typeof event.properties.loadTimeMs === 'number') {
        fileLoadTimes.push(event.properties.loadTimeMs);
      }
    }

    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    const p95 = (arr: number[]) => {
      if (!arr.length) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const idx = Math.ceil(sorted.length * 0.95) - 1;
      return sorted[Math.max(0, idx)];
    };

    return {
      avgApiResponseTime: Math.round(avg(apiTimes)),
      p95ApiResponseTime: Math.round(p95(apiTimes)),
      avgFileLoadTime: Math.round(avg(fileLoadTimes)),
      p95FileLoadTime: Math.round(p95(fileLoadTimes)),
    };
  }

  /**
   * Gets user-level activity summary
   * Returns a list of all active users with their activity stats
   */
  async getUserActivitySummary(days: number = 30): Promise<UserActivitySummary[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const events = await this.queryEvents({ startDate, endDate });

    // Aggregate by user email
    const userStats: Record<
      string,
      {
        userId: string;
        userEmail: string;
        eventCount: number;
        firstSeen: string;
        lastSeen: string;
        repos: Set<string>;
        eventsByType: Record<string, number>;
      }
    > = {};

    for (const event of events) {
      const userEmail = event.userEmail || event.userId;
      const userId = event.userId;

      if (!userStats[userEmail]) {
        userStats[userEmail] = {
          userId,
          userEmail,
          eventCount: 0,
          firstSeen: event.timestamp,
          lastSeen: event.timestamp,
          repos: new Set(),
          eventsByType: {},
        };
      }

      const stats = userStats[userEmail];
      stats.eventCount++;

      // Track first and last seen
      if (event.timestamp < stats.firstSeen) {
        stats.firstSeen = event.timestamp;
      }
      if (event.timestamp > stats.lastSeen) {
        stats.lastSeen = event.timestamp;
      }

      // Track repos
      const repoId = event.properties.repoId as string;
      if (repoId) {
        stats.repos.add(repoId);
      }

      // Track event types
      stats.eventsByType[event.event] = (stats.eventsByType[event.event] || 0) + 1;
    }

    // Convert to array and sort by activity (most active first)
    return Object.values(userStats)
      .map((stats) => ({
        userId: stats.userId,
        userEmail: stats.userEmail,
        eventCount: stats.eventCount,
        firstSeen: stats.firstSeen,
        lastSeen: stats.lastSeen,
        repoCount: stats.repos.size,
        topEvents: Object.entries(stats.eventsByType)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([event, count]) => ({ event, count })),
      }))
      .sort((a, b) => b.eventCount - a.eventCount);
  }

  /**
   * Gets detailed activity for a specific user
   */
  async getUserDetail(userEmail: string, days: number = 30): Promise<UserDetail | null> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get all events and filter by email
    const allEvents = await this.queryEvents({ startDate, endDate });
    const events = allEvents.filter(e => e.userEmail === userEmail || e.userId === userEmail);

    if (events.length === 0) {
      return null;
    }

    // Get the userId from the first event
    const userId = events[0]?.userId || userEmail;

    // Calculate stats
    const repos = new Set<string>();
    const eventsByType: Record<string, number> = {};
    const eventsByDay: Record<string, number> = {};
    const eventsByHour: number[] = new Array(24).fill(0);

    let fileOpens = 0;
    let searches = 0;
    let terminalSessions = 0;
    let apiRequests = 0;

    for (const event of events) {
      // Repos
      const repoId = event.properties.repoId as string;
      if (repoId) {
        repos.add(repoId);
      }

      // Event types
      eventsByType[event.event] = (eventsByType[event.event] || 0) + 1;

      // Events by day
      const day = event.timestamp.split('T')[0];
      eventsByDay[day] = (eventsByDay[day] || 0) + 1;

      // Events by hour
      const hour = new Date(event.timestamp).getHours();
      eventsByHour[hour]++;

      // Specific metrics
      switch (event.event) {
        case 'file_opened':
          fileOpens++;
          break;
        case 'search_performed':
          searches++;
          break;
        case 'terminal_connected':
          terminalSessions++;
          break;
        case 'api_request':
          apiRequests++;
          break;
      }
    }

    // Get recent events (last 50)
    const recentEvents = events
      .slice(-50)
      .reverse()
      .map((e) => ({
        timestamp: e.timestamp,
        event: e.event,
        repoId: e.properties.repoId as string | undefined,
        details: e.properties,
      }));

    return {
      userId,
      userEmail,
      period: {
        days,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      summary: {
        totalEvents: events.length,
        repoCount: repos.size,
        fileOpens,
        searches,
        terminalSessions,
        apiRequests,
      },
      activity: {
        eventsByType,
        eventsByDay,
        eventsByHour,
      },
      recentEvents,
    };
  }

  /**
   * Cleans up old log files based on retention policy
   */
  cleanupOldLogs(): void {
    if (!this.config.enabled) {
      return;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    try {
      const files = fs.readdirSync(this.logDir);
      for (const file of files) {
        if (!file.startsWith('analytics-') || !file.endsWith('.jsonl')) {
          continue;
        }

        // Extract date from filename
        const fileDate = file.slice(10, 20);
        if (fileDate < cutoffStr) {
          const filePath = path.join(this.logDir, file);
          fs.unlinkSync(filePath);
          console.log(`Deleted old analytics log: ${file}`);
        }
      }
    } catch (error) {
      console.error('Failed to cleanup old analytics logs:', error);
    }
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

export const analyticsLogger = new AnalyticsLogger();
