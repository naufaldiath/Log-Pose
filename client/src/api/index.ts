import type { User, RepoInfo, TreeResponse, FileResponse, SearchResponse, GitStatus, GitCommit, TerminalTab, UserSession } from '@/types';
import type {
  AnalyticsSummaryResponse,
  TimeSeriesResponse,
  FeatureAdoptionResponse,
  PerformanceMetricsResponse,
  TopReposResponse,
  ErrorsResponse,
  EventsResponse,
  AnalyticsEventType,
  UsersResponse,
  UserDetail
} from '@/types/analytics';

const API_BASE = '/api';

// Development email for testing (only used in dev mode)
// Use environment variable or default to a placeholder
const DEV_EMAIL = import.meta.env.DEV ? (import.meta.env.VITE_DEV_EMAIL || 'dev@localhost') : null;

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string>),
  };

  // Only add Content-Type if there's a body (not for DELETE requests, etc.)
  if (options?.body) {
    headers['Content-Type'] = 'application/json';
  }

  // Add dev email header in development mode
  if (DEV_EMAIL) {
    headers['X-Dev-Email'] = DEV_EMAIL;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new ApiError(response.status, data.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// Identity
export async function getMe(): Promise<User> {
  return request<User>('/me');
}

// Repos
export async function getRepos(): Promise<RepoInfo[]> {
  return request<RepoInfo[]>('/repos');
}

// File tree
export async function getTree(repoId: string, path = ''): Promise<TreeResponse> {
  const params = new URLSearchParams({ repoId, path });
  return request<TreeResponse>(`/tree?${params}`);
}

// File operations
export async function getFile(repoId: string, path: string): Promise<FileResponse> {
  const params = new URLSearchParams({ repoId, path });
  return request<FileResponse>(`/file?${params}`);
}

export async function saveFile(repoId: string, path: string, content: string): Promise<{ ok: boolean; bytesWritten: number }> {
  const params = new URLSearchParams({ repoId, path });
  return request(`/file?${params}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}

export async function deleteFile(repoId: string, path: string): Promise<{ ok: boolean }> {
  const params = new URLSearchParams({ repoId, path });
  return request(`/file?${params}`, { method: 'DELETE' });
}

// Search
export async function searchRepo(
  repoId: string,
  query: string,
  options?: { caseSensitive?: boolean; regex?: boolean; wholeWord?: boolean; glob?: string; paths?: string[] }
): Promise<SearchResponse> {
  return request<SearchResponse>('/search', {
    method: 'POST',
    body: JSON.stringify({
      repoId,
      query,
      ...(options?.caseSensitive && { caseSensitive: true }),
      ...(options?.regex && { regex: true }),
      ...(options?.wholeWord && { wholeWord: true }),
      ...(options?.glob && { glob: options.glob }),
      ...(options?.paths && { paths: options.paths }),
    }),
  });
}

// Git
export async function getGitStatus(repoId: string): Promise<GitStatus> {
  const params = new URLSearchParams({ repoId });
  return request<GitStatus>(`/git/status?${params}`);
}

export async function getGitDiff(repoId: string, path?: string): Promise<{ diff: string }> {
  const params = new URLSearchParams({ repoId });
  if (path) params.set('path', path);
  return request<{ diff: string }>(`/git/diff?${params}`);
}

export async function getGitLog(repoId: string, limit = 50): Promise<{ commits: GitCommit[] }> {
  const params = new URLSearchParams({ repoId, limit: String(limit) });
  return request<{ commits: GitCommit[] }>(`/git/log?${params}`);
}

export async function getGitBranches(repoId: string): Promise<{ current: string; all: string[] }> {
  const params = new URLSearchParams({ repoId });
  return request<{ current: string; all: string[] }>(`/git/branches?${params}`);
}

export async function checkoutBranch(
  repoId: string,
  branch: string,
  create?: boolean
): Promise<{ success: boolean; branch: string; worktreePath: string; message: string }> {
  return request('/git/checkout', {
    method: 'POST',
    body: JSON.stringify({ repoId, branch, create }),
  });
}

// Tasks
export async function getTasks(repoId: string): Promise<{ tasks: string[] }> {
  const params = new URLSearchParams({ repoId });
  return request<{ tasks: string[] }>(`/tasks?${params}`);
}

export async function runTask(repoId: string, taskId: string): Promise<{ runId: string; state: string }> {
  return request('/tasks/run', {
    method: 'POST',
    body: JSON.stringify({ repoId, taskId }),
  });
}

export async function stopTask(runId: string): Promise<{ ok: boolean }> {
  return request('/tasks/stop', {
    method: 'POST',
    body: JSON.stringify({ runId }),
  });
}

// Terminal Sessions (Tabs)
export async function getSessions(repoId: string): Promise<{ tabs: TerminalTab[] }> {
  const params = new URLSearchParams({ repoId });
  return request<{ tabs: TerminalTab[] }>(`/sessions?${params}`);
}

export async function createSession(repoId: string, name?: string, branch?: string): Promise<TerminalTab> {
  return request<TerminalTab>('/sessions', {
    method: 'POST',
    body: JSON.stringify({ repoId, name, branch }),
  });
}

export async function deleteSession(sessionId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/sessions/${sessionId}`, {
    method: 'DELETE',
  });
}

export async function renameSession(sessionId: string, name: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/sessions/${sessionId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export async function getAllUserSessions(): Promise<{ sessions: UserSession[] }> {
  return request<{ sessions: UserSession[] }>('/sessions/all');
}

// Analytics (Admin only)
export async function getAnalyticsSummary(days?: number): Promise<AnalyticsSummaryResponse> {
  const params = new URLSearchParams();
  if (days) params.set('days', String(days));
  return request<AnalyticsSummaryResponse>(`/analytics/summary?${params}`);
}

export async function getAnalyticsTimeSeries(
  eventTypes: AnalyticsEventType[],
  days?: number
): Promise<TimeSeriesResponse> {
  const params = new URLSearchParams();
  if (days) params.set('days', String(days));
  if (eventTypes.length) params.set('eventTypes', eventTypes.join(','));
  return request<TimeSeriesResponse>(`/analytics/timeseries?${params}`);
}

export async function getFeatureAdoption(days?: number): Promise<FeatureAdoptionResponse> {
  const params = new URLSearchParams();
  if (days) params.set('days', String(days));
  return request<FeatureAdoptionResponse>(`/analytics/feature-adoption?${params}`);
}

export async function getPerformanceMetrics(days?: number): Promise<PerformanceMetricsResponse> {
  const params = new URLSearchParams();
  if (days) params.set('days', String(days));
  return request<PerformanceMetricsResponse>(`/analytics/performance?${params}`);
}

export async function getTopRepos(days?: number): Promise<TopReposResponse> {
  const params = new URLSearchParams();
  if (days) params.set('days', String(days));
  return request<TopReposResponse>(`/analytics/top-repos?${params}`);
}

export async function getAnalyticsErrors(days?: number): Promise<ErrorsResponse> {
  const params = new URLSearchParams();
  if (days) params.set('days', String(days));
  return request<ErrorsResponse>(`/analytics/errors?${params}`);
}

export async function getAnalyticsEvents(
  options?: { days?: number; eventType?: string; limit?: number }
): Promise<EventsResponse> {
  const params = new URLSearchParams();
  if (options?.days) params.set('days', String(options.days));
  if (options?.eventType) params.set('eventType', options.eventType);
  if (options?.limit) params.set('limit', String(options.limit));
  return request<EventsResponse>(`/analytics/events?${params}`);
}

export async function checkAnalyticsAccess(): Promise<{ isAdmin: boolean; email: string }> {
  return request<{ isAdmin: boolean; email: string }>('/analytics/me');
}

// User-level analytics
export async function getUsersActivity(days?: number): Promise<UsersResponse> {
  const params = new URLSearchParams();
  if (days) params.set('days', String(days));
  return request<UsersResponse>(`/analytics/users?${params}`);
}

export async function getUserDetail(userEmail: string, days?: number): Promise<UserDetail> {
  const params = new URLSearchParams();
  if (days) params.set('days', String(days));
  return request<UserDetail>(`/analytics/users/${encodeURIComponent(userEmail)}?${params}`);
}

// Admin Settings
export interface AdminSettings {
  allowlistEmails: string[];
  adminEmails: string[];
  updatedAt: string;
  updatedBy?: string;
}

export async function getAdminSettings(): Promise<AdminSettings> {
  return request<AdminSettings>('/admin/settings');
}

export async function updateAllowlistEmails(emails: string[]): Promise<{ success: boolean; emails: string[]; updatedAt: string }> {
  return request('/admin/settings/allowlist', {
    method: 'PUT',
    body: JSON.stringify({ emails }),
  });
}

export async function updateAdminEmails(emails: string[]): Promise<{ success: boolean; emails: string[]; updatedAt: string }> {
  return request('/admin/settings/admin-emails', {
    method: 'PUT',
    body: JSON.stringify({ emails }),
  });
}

export { ApiError };
