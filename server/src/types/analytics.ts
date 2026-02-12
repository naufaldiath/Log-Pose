/**
 * Analytics event type definitions
 * Product analytics for understanding user behavior, feature usage, and performance
 */

// Analytics event types
export type AnalyticsEventType =
  // User Session Lifecycle
  | 'app_loaded'
  | 'app_unloaded'
  | 'user_authenticated'
  | 'repo_selected'
  | 'sidebar_toggled'
  // File Operations
  | 'file_opened'
  | 'file_saved'
  | 'file_closed'
  | 'tab_switched'
  | 'file_created'
  | 'file_deleted'
  | 'file_renamed'
  // Terminal Usage
  | 'terminal_tab_created'
  | 'terminal_connected'
  | 'terminal_disconnected'
  | 'terminal_tab_closed'
  | 'terminal_tab_renamed'
  | 'terminal_restarted'
  | 'terminal_max_sessions'
  | 'mobile_keybar_used'
  | 'terminal_font_size_changed'
  | 'terminal_prompt_submitted'
  // Search Usage
  | 'search_opened'
  | 'search_performed'
  | 'search_result_clicked'
  | 'replace_single'
  | 'replace_all'
  // Git Operations
  | 'git_status_viewed'
  | 'git_diff_viewed'
  | 'git_log_viewed'
  | 'git_checkout'
  // Task Runner
  | 'task_started'
  | 'task_completed'
  | 'task_stopped'
  | 'task_output_viewed'
  // Session Management
  | 'session_manager_opened'
  | 'session_deleted'
  | 'session_switched'
  // Performance Metrics
  | 'api_request'
  | 'file_tree_loaded'
  | 'editor_settings_changed'
  // Error Events
  | 'api_error'
  | 'websocket_error'
  | 'file_operation_error'
  | 'path_security_violation';

// Base analytics event interface
export interface AnalyticsEvent {
  timestamp: string;
  event: AnalyticsEventType;
  userId: string; // Hashed user identifier
  userEmail?: string; // User email (only for admin dashboard)
  sessionId: string; // Session identifier
  properties: Record<string, unknown>;
}

// User session lifecycle events
export interface AppLoadedEvent {
  userAgent: string;
  isMobile: boolean;
  screenWidth?: number;
  screenHeight?: number;
}

export interface AppUnloadedEvent {
  sessionDurationMs: number;
  activeTabsCount: number;
}

export interface RepoSelectedEvent {
  repoId: string;
  previousRepoId?: string;
}

// File operation events
export interface FileOpenedEvent {
  repoId: string;
  fileExtension: string;
  fileSize: number;
  loadTimeMs: number;
}

export interface FileSavedEvent {
  repoId: string;
  fileExtension: string;
  fileSize: number;
  durationMs: number;
}

export interface FileClosedEvent {
  repoId: string;
  timeOpenMs: number;
  wasModified: boolean;
}

// Terminal usage events
export interface TerminalTabCreatedEvent {
  repoId: string;
  sessionId: string;
  isFirstTab: boolean;
}

export interface TerminalConnectedEvent {
  repoId: string;
  connectTimeMs: number;
}

export interface TerminalDisconnectedEvent {
  repoId: string;
  durationMs: number;
  reason?: string;
}

export interface MobileKeybarUsedEvent {
  keyType: 'esc' | 'tab' | 'ctrl' | 'alt' | 'up' | 'down' | 'left' | 'right' | 'enter' | 'slash';
}

export interface TerminalPromptSubmittedEvent {
  repoId: string;
  prompt: string;
  promptLength: number;
  isQuestion: boolean;
  hasCodeReference: boolean;
}

// Search usage events
export interface SearchPerformedEvent {
  repoId: string;
  resultCount: number;
  durationMs: number;
  hasRegex: boolean;
  hasFilters: boolean;
}

// Task runner events
export interface TaskCompletedEvent {
  repoId: string;
  taskId: string;
  durationMs: number;
  exitCode?: number;
}

// Performance metrics
export interface ApiRequestEvent {
  endpoint: string;
  method: string;
  durationMs: number;
  statusCode: number;
}

export interface FileTreeLoadedEvent {
  repoId: string;
  entryCount: number;
  durationMs: number;
}

// Error events
export interface ApiErrorEvent {
  endpoint: string;
  statusCode: number;
  errorType: string;
}

export interface PathSecurityViolationEvent {
  attemptedPath: string;
  operation: string;
}

// Analytics configuration
export interface AnalyticsConfig {
  enabled: boolean;
  logDir: string;
  retentionDays: number;
  hashUserIds: boolean;
}

// Analytics query types
export interface AnalyticsQuery {
  startDate?: Date;
  endDate?: Date;
  eventTypes?: AnalyticsEventType[];
  userId?: string;
  repoId?: string;
  limit?: number;
}

export interface AnalyticsSummary {
  totalEvents: number;
  uniqueUsers: number;
  eventsByType: Record<string, number>;
  eventsByDay: Record<string, number>;
}

export interface TimeSeriesDataPoint {
  date: string;
  count: number;
}

export interface FeatureAdoptionMetrics {
  terminalUsers: number;
  searchUsers: number;
  mobileUsers: number;
  gitFeatureUsers: number;
  taskRunnerUsers: number;
}

export interface PerformanceMetrics {
  avgApiResponseTime: number;
  p95ApiResponseTime: number;
  avgFileLoadTime: number;
  p95FileLoadTime: number;
}

// Popular prompts analytics
export interface PopularPrompt {
  prompt: string;
  count: number;
  uniqueUsers: number;
  isQuestion: boolean;
  category: 'code' | 'question' | 'command' | 'other';
}

export interface PopularPromptsResponse {
  period: {
    days: number;
    startDate: string;
    endDate: string;
  };
  totalPrompts: number;
  uniquePrompts: number;
  prompts: PopularPrompt[];
}

// User-level analytics types
export interface UserActivitySummary {
  userId: string;
  userEmail: string;
  eventCount: number;
  firstSeen: string;
  lastSeen: string;
  repoCount: number;
  topEvents: { event: string; count: number }[];
}

export interface UserDetail {
  userId: string;
  userEmail: string;
  period: {
    days: number;
    startDate: string;
    endDate: string;
  };
  summary: {
    totalEvents: number;
    repoCount: number;
    fileOpens: number;
    searches: number;
    terminalSessions: number;
    apiRequests: number;
  };
  activity: {
    eventsByType: Record<string, number>;
    eventsByDay: Record<string, number>;
    eventsByHour: number[];
  };
  recentEvents: {
    timestamp: string;
    event: string;
    repoId?: string;
    details: Record<string, unknown>;
  }[];
}
