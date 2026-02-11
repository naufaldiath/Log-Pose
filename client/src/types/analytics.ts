// Analytics Types - matching server types

export type AnalyticsEventType =
  | 'app_loaded'
  | 'app_unloaded'
  | 'user_authenticated'
  | 'repo_selected'
  | 'sidebar_toggled'
  | 'file_opened'
  | 'file_saved'
  | 'file_closed'
  | 'tab_switched'
  | 'file_created'
  | 'file_deleted'
  | 'file_renamed'
  | 'terminal_tab_created'
  | 'terminal_connected'
  | 'terminal_disconnected'
  | 'terminal_tab_closed'
  | 'terminal_tab_renamed'
  | 'terminal_restarted'
  | 'terminal_max_sessions'
  | 'mobile_keybar_used'
  | 'terminal_font_size_changed'
  | 'search_opened'
  | 'search_performed'
  | 'search_result_clicked'
  | 'replace_single'
  | 'replace_all'
  | 'git_status_viewed'
  | 'git_diff_viewed'
  | 'git_log_viewed'
  | 'task_started'
  | 'task_completed'
  | 'task_stopped'
  | 'task_output_viewed'
  | 'session_manager_opened'
  | 'session_deleted'
  | 'session_switched'
  | 'api_request'
  | 'file_tree_loaded'
  | 'editor_settings_changed'
  | 'api_error'
  | 'websocket_error'
  | 'file_operation_error'
  | 'path_security_violation';

export interface AnalyticsEvent {
  timestamp: string;
  event: AnalyticsEventType;
  userId: string;
  sessionId: string;
  properties: Record<string, unknown>;
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

export interface RepoStats {
  repoId: string;
  eventCount: number;
  uniqueUsers: number;
  fileOpens: number;
  searches: number;
  terminalSessions: number;
}

export interface ErrorStats {
  count: number;
  endpoints: Record<string, number>;
}

export interface AnalyticsSummaryResponse {
  period: {
    days: number;
    startDate: string;
    endDate: string;
  };
  summary: AnalyticsSummary;
}

export interface TimeSeriesResponse {
  period: {
    days: number;
  };
  eventTypes: AnalyticsEventType[];
  data: TimeSeriesDataPoint[];
}

export interface FeatureAdoptionResponse {
  period: {
    days: number;
  };
  metrics: FeatureAdoptionMetrics;
}

export interface PerformanceMetricsResponse {
  period: {
    days: number;
  };
  metrics: PerformanceMetrics;
}

export interface TopReposResponse {
  period: {
    days: number;
  };
  repos: RepoStats[];
}

export interface ErrorsResponse {
  period: {
    days: number;
  };
  totalErrors: number;
  errorsByType: Record<string, ErrorStats>;
}

export interface EventsResponse {
  period: {
    days: number;
  };
  filters: {
    eventType?: string;
  };
  count: number;
  events: AnalyticsEvent[];
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

export interface UsersResponse {
  period: {
    days: number;
  };
  count: number;
  users: UserActivitySummary[];
}
